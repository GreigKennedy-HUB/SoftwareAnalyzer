const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        cb(null, `${timestamp}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: (process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.xlsx' && ext !== '.xls' && ext !== '.csv') {
            return cb(new Error('Only Excel and CSV files are allowed'));
        }
        cb(null, true);
    }
});

// ============================================
// ANALYSIS ENGINE
// ============================================

class SoftwareAnalyzer {
    constructor(pool) {
        this.pool = pool;
        this.exclusionRules = [];
        this.mappingRules = [];
    }

    async loadRules() {
        // Load exclusion rules
        const exclusionResult = await this.pool.query(
            'SELECT * FROM exclusion_rules WHERE is_active = true ORDER BY id'
        );
        this.exclusionRules = exclusionResult.rows;

        // Load mapping rules
        const mappingResult = await this.pool.query(
            'SELECT * FROM software_mappings WHERE is_active = true ORDER BY id'
        );
        this.mappingRules = mappingResult.rows;
    }

    shouldExclude(softwareName) {
        const name = softwareName.trim();
        
        for (const rule of this.exclusionRules) {
            const pattern = rule.pattern_value;
            let matches = false;

            switch (rule.pattern_type) {
                case 'exact':
                    matches = name.toLowerCase() === pattern.toLowerCase();
                    break;
                case 'contains':
                    matches = name.toLowerCase().includes(pattern.toLowerCase());
                    break;
                case 'startswith':
                    matches = name.toLowerCase().startsWith(pattern.toLowerCase());
                    break;
                case 'endswith':
                    matches = name.toLowerCase().endsWith(pattern.toLowerCase());
                    break;
                case 'regex':
                    try {
                        const regex = new RegExp(pattern, 'i');
                        matches = regex.test(name);
                    } catch (e) {
                        console.warn(`Invalid regex pattern: ${pattern}`);
                    }
                    break;
            }

            if (matches) {
                return { excluded: true, rule };
            }
        }

        return { excluded: false };
    }

    findMapping(softwareName) {
        const name = softwareName.trim();

        for (const rule of this.mappingRules) {
            const pattern = rule.original_pattern;
            let matches = false;

            switch (rule.pattern_type) {
                case 'exact':
                    matches = name.toLowerCase() === pattern.toLowerCase();
                    break;
                case 'contains':
                    matches = name.toLowerCase().includes(pattern.toLowerCase());
                    break;
                case 'startswith':
                    matches = name.toLowerCase().startsWith(pattern.toLowerCase());
                    break;
                case 'regex':
                    try {
                        const regex = new RegExp(pattern, 'i');
                        matches = regex.test(name);
                    } catch (e) {
                        console.warn(`Invalid regex pattern: ${pattern}`);
                    }
                    break;
            }

            if (matches) {
                return rule;
            }
        }

        return null;
    }

    async analyze(softwareList) {
        await this.loadRules();

        const results = {
            included: new Map(), // canonical_name -> { details, originalEntries: [] }
            excluded: [],
            unmapped: []
        };

        for (const item of softwareList) {
            const name = item.name?.trim();
            if (!name) continue;

            // Check exclusion first
            const exclusionCheck = this.shouldExclude(name);
            if (exclusionCheck.excluded) {
                results.excluded.push({
                    name,
                    reason: exclusionCheck.rule.category,
                    ruleReason: exclusionCheck.rule.reason
                });
                continue;
            }

            // Check for mapping
            const mapping = this.findMapping(name);
            if (mapping) {
                const canonicalName = mapping.canonical_name;
                if (!results.included.has(canonicalName)) {
                    results.included.set(canonicalName, {
                        canonicalName,
                        category: mapping.category || 'Uncategorized',
                        deploymentType: mapping.deployment_type || 'Desktop',
                        description: mapping.description || '',
                        originalEntries: []
                    });
                }
                results.included.get(canonicalName).originalEntries.push({
                    name,
                    publisher: item.publisher,
                    deviceCount: item.deviceCount
                });
            } else {
                // No mapping found - needs review
                results.unmapped.push({
                    name,
                    publisher: item.publisher,
                    deviceCount: item.deviceCount
                });
            }
        }

        return results;
    }
}

const analyzer = new SoftwareAnalyzer(pool);

// ============================================
// API ROUTES
// ============================================

// Upload and analyze file
app.post('/api/analyze', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Manual agency override from form, or will be auto-detected
        let agencyName = req.body.agency || null;

        const workbook = XLSX.readFile(req.file.path);
        
        // Helper function to find a column by checking multiple possible names
        function findColumn(row, possibleNames) {
            const keys = Object.keys(row);
            for (const name of possibleNames) {
                // Exact match first
                const exactMatch = keys.find(k => k.toLowerCase().trim() === name.toLowerCase());
                if (exactMatch && row[exactMatch]) return row[exactMatch];
                
                // Partial match (column contains the search term)
                const partialMatch = keys.find(k => k.toLowerCase().includes(name.toLowerCase()));
                if (partialMatch && row[partialMatch]) return row[partialMatch];
            }
            return null;
        }

        // Helper to find agency/customer name from any sheet
        function findAgencyInSheet(sheetData) {
            if (!sheetData || sheetData.length === 0) return null;
            
            const customerColumns = [
                'customer name', 'customer', 'client name', 'client', 
                'agency name', 'agency', 'company', 'organization',
                'account name', 'account'
            ];
            
            // Check first row for customer/agency name
            const firstRow = sheetData[0];
            const agency = findColumn(firstRow, customerColumns);
            if (agency) return agency.toString().trim();
            
            return null;
        }

        // Try to auto-detect agency name from various sources
        if (!agencyName) {
            // Method 1: Check all sheets for customer/agency columns
            for (const sheetName of workbook.SheetNames) {
                const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
                agencyName = findAgencyInSheet(sheetData);
                if (agencyName) break;
            }
            
            // Method 2: Extract from filename (e.g., "Fenner-Esler_-_Software_Inventory.xlsx")
            if (!agencyName && req.file.originalname) {
                const filename = req.file.originalname;
                // Try to extract agency name before common suffixes
                const match = filename.match(/^(.+?)[\s_-]*[-_][\s_-]*(Software|Inventory|Report|devices)/i);
                if (match) {
                    agencyName = match[1].replace(/[_-]/g, ' ').trim();
                }
            }
        }

        // Try to find the Software sheet, or use the first sheet
        let sheetName = workbook.SheetNames.find(s => 
            s.toLowerCase().includes('software')
        ) || workbook.SheetNames[0];
        
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        // Extract software names - check multiple possible column names
        const softwareList = data.map(row => {
            const name = findColumn(row, ['software name', 'name', 'application', 'app name', 'program']);
            const publisher = findColumn(row, ['publisher', 'software publisher', 'vendor', 'manufacturer']);
            const deviceCount = findColumn(row, ['number of devices', 'device count', 'count', 'devices', 'quantity']);
            
            return {
                name: name || Object.values(row)[0],
                publisher: publisher || '',
                deviceCount: deviceCount || 1
            };
        }).filter(item => item.name);

        // Run analysis
        const results = await analyzer.analyze(softwareList);

        // Convert Map to array for JSON response
        const includedArray = Array.from(results.included.values()).map(item => ({
            ...item,
            originalCount: item.originalEntries.length,
            totalDevices: item.originalEntries.reduce((sum, e) => sum + (parseInt(e.deviceCount) || 1), 0)
        }));

        // Log to history
        try {
            await pool.query(
                `INSERT INTO analysis_history (upload_filename, agency_name, input_count, output_count, excluded_count, status, processed_at)
                 VALUES ($1, $2, $3, $4, $5, 'completed', NOW())`,
                [req.file.originalname, agencyName, softwareList.length, includedArray.length, results.excluded.length]
            );
        } catch (dbErr) {
            console.warn('Could not log to history:', dbErr.message);
        }

        // Clean up uploaded file
        fs.unlink(req.file.path, () => {});

        res.json({
            success: true,
            agency: agencyName,
            summary: {
                totalInput: softwareList.length,
                totalOutput: includedArray.length,
                excluded: results.excluded.length,
                unmapped: results.unmapped.length
            },
            included: includedArray.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)),
            excluded: results.excluded,
            unmapped: results.unmapped.sort((a, b) => (b.deviceCount || 0) - (a.deviceCount || 0))
        });

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: 'Analysis failed: ' + error.message });
    }
});

// Get all exclusion rules
app.get('/api/exclusion-rules', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM exclusion_rules ORDER BY category, pattern_value'
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add exclusion rule
app.post('/api/exclusion-rules', async (req, res) => {
    try {
        const { pattern_type, pattern_value, category, reason } = req.body;
        const result = await pool.query(
            `INSERT INTO exclusion_rules (pattern_type, pattern_value, category, reason)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [pattern_type, pattern_value, category, reason]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update exclusion rule
app.put('/api/exclusion-rules/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { pattern_type, pattern_value, category, reason, is_active } = req.body;
        const result = await pool.query(
            `UPDATE exclusion_rules 
             SET pattern_type = $1, pattern_value = $2, category = $3, reason = $4, is_active = $5, updated_at = NOW()
             WHERE id = $6 RETURNING *`,
            [pattern_type, pattern_value, category, reason, is_active, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete exclusion rule
app.delete('/api/exclusion-rules/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM exclusion_rules WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all software mappings
app.get('/api/software-mappings', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM software_mappings ORDER BY canonical_name, original_pattern'
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add software mapping
app.post('/api/software-mappings', async (req, res) => {
    try {
        const { pattern_type, original_pattern, canonical_name, category, deployment_type, description } = req.body;
        const result = await pool.query(
            `INSERT INTO software_mappings (pattern_type, original_pattern, canonical_name, category, deployment_type, description)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [pattern_type, original_pattern, canonical_name, category, deployment_type, description]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update software mapping
app.put('/api/software-mappings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { pattern_type, original_pattern, canonical_name, category, deployment_type, description, is_active } = req.body;
        const result = await pool.query(
            `UPDATE software_mappings 
             SET pattern_type = $1, original_pattern = $2, canonical_name = $3, category = $4, 
                 deployment_type = $5, description = $6, is_active = $7, updated_at = NOW()
             WHERE id = $8 RETURNING *`,
            [pattern_type, original_pattern, canonical_name, category, deployment_type, description, is_active, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete software mapping
app.delete('/api/software-mappings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM software_mappings WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Submit admin feedback
app.post('/api/feedback', async (req, res) => {
    try {
        const { software_name, action_type, reason, suggested_category, suggested_canonical_name, suggested_deployment_type, created_by } = req.body;
        
        const result = await pool.query(
            `INSERT INTO admin_feedback 
             (software_name, action_type, reason, suggested_category, suggested_canonical_name, suggested_deployment_type, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [software_name, action_type, reason, suggested_category, suggested_canonical_name, suggested_deployment_type, created_by || 'admin']
        );

        // Auto-apply certain feedback types
        if (action_type === 'exclude' && reason) {
            await pool.query(
                `INSERT INTO exclusion_rules (pattern_type, pattern_value, category, reason, created_by)
                 VALUES ('exact', $1, 'User Defined', $2, $3)`,
                [software_name, reason, created_by || 'admin']
            );
            await pool.query(
                'UPDATE admin_feedback SET applied_to_rules = true WHERE id = $1',
                [result.rows[0].id]
            );
        }

        if (action_type === 'categorize' && suggested_canonical_name) {
            await pool.query(
                `INSERT INTO software_mappings (pattern_type, original_pattern, canonical_name, category, deployment_type, description, created_by)
                 VALUES ('exact', $1, $2, $3, $4, $5, $6)`,
                [software_name, suggested_canonical_name, suggested_category || 'Uncategorized', suggested_deployment_type || 'Desktop', reason, created_by || 'admin']
            );
            await pool.query(
                'UPDATE admin_feedback SET applied_to_rules = true WHERE id = $1',
                [result.rows[0].id]
            );
        }

        // For "include" action, the mapping is created separately by the frontend
        // Just mark it as applied since we know a mapping rule was created
        if (action_type === 'include') {
            await pool.query(
                'UPDATE admin_feedback SET applied_to_rules = true WHERE id = $1',
                [result.rows[0].id]
            );
        }

        res.json({ success: true, feedback: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get feedback history
app.get('/api/feedback', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM admin_feedback ORDER BY created_at DESC LIMIT 100'
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get analysis history
app.get('/api/history', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM analysis_history ORDER BY uploaded_at DESC LIMIT 50'
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get categories list
app.get('/api/categories', async (req, res) => {
    try {
        const exclusionCats = await pool.query(
            'SELECT DISTINCT category FROM exclusion_rules ORDER BY category'
        );
        const mappingCats = await pool.query(
            'SELECT DISTINCT category FROM software_mappings WHERE category IS NOT NULL ORDER BY category'
        );
        
        const allCats = new Set([
            ...exclusionCats.rows.map(r => r.category),
            ...mappingCats.rows.map(r => r.category)
        ]);
        
        res.json(Array.from(allCats).sort());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export results as CSV
app.post('/api/export/csv', (req, res) => {
    try {
        const { data } = req.body;
        
        const headers = ['Application Name', 'Category', 'Deployment Type', 'Description', 'Original Entries', 'Total Devices'];
        const rows = data.map(item => [
            item.canonicalName,
            item.category,
            item.deploymentType,
            item.description,
            item.originalCount,
            item.totalDevices
        ]);
        
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="software_analysis.csv"');
        res.send(csvContent);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'healthy', database: 'connected' });
    } catch (error) {
        res.json({ status: 'degraded', database: 'disconnected', error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});

module.exports = app;
