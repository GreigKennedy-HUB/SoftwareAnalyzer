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

        // Fetch disposition mappings for all canonical names
        const canonicalNames = includedArray.map(item => item.canonicalName);
        let dispositionMap = new Map();
        
        if (canonicalNames.length > 0) {
            try {
                const dispResult = await pool.query(`
                    SELECT dm.*, aps.name as replacement_name, aps.category as replacement_category
                    FROM disposition_mappings dm
                    LEFT JOIN approved_software aps ON dm.approved_software_id = aps.id
                    WHERE dm.canonical_name = ANY($1)
                `, [canonicalNames]);
                
                dispResult.rows.forEach(row => {
                    dispositionMap.set(row.canonical_name, {
                        disposition: row.disposition,
                        replacementId: row.approved_software_id,
                        replacementName: row.replacement_name,
                        replacementCategory: row.replacement_category,
                        notes: row.notes
                    });
                });
            } catch (dispErr) {
                console.warn('Could not fetch dispositions:', dispErr.message);
            }
        }

        // Create disposition entries for any canonical names that don't have one yet
        const missingDispositions = canonicalNames.filter(name => !dispositionMap.has(name));
        for (const name of missingDispositions) {
            try {
                await pool.query(`
                    INSERT INTO disposition_mappings (canonical_name, disposition, updated_by)
                    VALUES ($1, 'pending', 'system')
                    ON CONFLICT (canonical_name) DO NOTHING
                `, [name]);
                dispositionMap.set(name, { disposition: 'pending', replacementId: null, replacementName: null, notes: null });
            } catch (insertErr) {
                // Ignore - might already exist from concurrent request
            }
        }

        // Add disposition data to included results
        const includedWithDisposition = includedArray.map(item => ({
            ...item,
            disposition: dispositionMap.get(item.canonicalName)?.disposition || 'pending',
            replacementId: dispositionMap.get(item.canonicalName)?.replacementId || null,
            replacementName: dispositionMap.get(item.canonicalName)?.replacementName || null,
            dispositionNotes: dispositionMap.get(item.canonicalName)?.notes || null
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
                totalOutput: includedWithDisposition.length,
                excluded: results.excluded.length,
                unmapped: results.unmapped.length,
                pendingDisposition: includedWithDisposition.filter(i => i.disposition === 'pending').length
            },
            included: includedWithDisposition.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)),
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
                 deployment_type = $5, description = $6, is_active = COALESCE($7, is_active), updated_at = NOW()
             WHERE id = $8 RETURNING *`,
            [pattern_type, original_pattern, canonical_name, category, deployment_type, description, is_active !== undefined ? is_active : null, id]
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

// ============================================
// SAVED CLIENTS
// ============================================

// Get all saved clients
app.get('/api/clients', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, agency_name, source_filename, summary, notes, status, created_at, updated_at, created_by, updated_by
            FROM saved_clients 
            ORDER BY updated_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get a single client with full analysis data
app.get('/api/clients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT * FROM saved_clients WHERE id = $1',
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save a new client
app.post('/api/clients', async (req, res) => {
    try {
        const { agency_name, analysis_data, source_filename, summary, notes, status } = req.body;
        
        const result = await pool.query(`
            INSERT INTO saved_clients (agency_name, analysis_data, source_filename, summary, notes, status)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [agency_name, JSON.stringify(analysis_data), source_filename, JSON.stringify(summary), notes, status || 'in_progress']);
        
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update an existing client
app.put('/api/clients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { agency_name, analysis_data, summary, notes, status, updated_by } = req.body;
        
        const result = await pool.query(`
            UPDATE saved_clients 
            SET agency_name = COALESCE($1, agency_name),
                analysis_data = COALESCE($2, analysis_data),
                summary = COALESCE($3, summary),
                notes = COALESCE($4, notes),
                status = COALESCE($5, status),
                updated_by = $6,
                updated_at = NOW()
            WHERE id = $7
            RETURNING *
        `, [agency_name, analysis_data ? JSON.stringify(analysis_data) : null, summary ? JSON.stringify(summary) : null, notes, status, updated_by || 'admin', id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a client
app.delete('/api/clients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM saved_clients WHERE id = $1 RETURNING id', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Client not found' });
        }
        res.json({ success: true });
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
        const { data, agency } = req.body;
        
        const headers = ['Application Name', 'Category', 'Deployment Type', 'Disposition', 'Hub Standard Replacement', 'Description', 'Original Entries', 'Total Devices', 'Notes'];
        const rows = data.map(item => [
            item.canonicalName,
            item.category,
            item.deploymentType,
            item.disposition || 'pending',
            item.replacementName || '',
            item.description,
            item.originalCount,
            item.totalDevices,
            item.dispositionNotes || ''
        ]);
        
        // Add agency header if provided
        let csvContent = '';
        if (agency) {
            csvContent = `Agency: ${agency}\nExport Date: ${new Date().toLocaleDateString()}\n\n`;
        }
        
        csvContent += [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="software_analysis_${agency ? agency.replace(/[^a-z0-9]/gi, '_') + '_' : ''}${new Date().toISOString().split('T')[0]}.csv"`);
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

// ============================================
// PHASE 3: APPROVED SOFTWARE & DISPOSITIONS
// ============================================

// Get all approved software (Hub standards)
app.get('/api/approved-software', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM approved_software WHERE is_active = true ORDER BY category, name'
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add approved software
app.post('/api/approved-software', async (req, res) => {
    try {
        const { name, category, vendor, notes } = req.body;
        const result = await pool.query(
            `INSERT INTO approved_software (name, category, vendor, notes)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, category, vendor, notes]
        );
        res.json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') { // unique violation
            res.status(400).json({ error: 'Software with this name already exists' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// Update approved software
app.put('/api/approved-software/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, vendor, notes, is_active } = req.body;
        const result = await pool.query(
            `UPDATE approved_software 
             SET name = $1, category = $2, vendor = $3, notes = $4, is_active = $5, updated_at = NOW()
             WHERE id = $6 RETURNING *`,
            [name, category, vendor, notes, is_active, id]
        );
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete approved software
app.delete('/api/approved-software/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM approved_software WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all disposition mappings with approved software details
app.get('/api/disposition-mappings', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT dm.*, aps.name as replacement_name, aps.category as replacement_category
            FROM disposition_mappings dm
            LEFT JOIN approved_software aps ON dm.approved_software_id = aps.id
            ORDER BY dm.disposition, dm.canonical_name
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get disposition for a specific canonical name
app.get('/api/disposition-mappings/:canonicalName', async (req, res) => {
    try {
        const { canonicalName } = req.params;
        const result = await pool.query(`
            SELECT dm.*, aps.name as replacement_name, aps.category as replacement_category
            FROM disposition_mappings dm
            LEFT JOIN approved_software aps ON dm.approved_software_id = aps.id
            WHERE dm.canonical_name = $1
        `, [canonicalName]);
        res.json(result.rows[0] || null);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create or update disposition mapping
app.post('/api/disposition-mappings', async (req, res) => {
    try {
        const { canonical_name, disposition, approved_software_id, notes, updated_by } = req.body;
        
        // Upsert - insert or update if exists
        const result = await pool.query(`
            INSERT INTO disposition_mappings (canonical_name, disposition, approved_software_id, notes, updated_by)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (canonical_name) 
            DO UPDATE SET 
                disposition = EXCLUDED.disposition,
                approved_software_id = EXCLUDED.approved_software_id,
                notes = EXCLUDED.notes,
                updated_by = EXCLUDED.updated_by,
                updated_at = NOW()
            RETURNING *
        `, [canonical_name, disposition, approved_software_id || null, notes, updated_by || 'admin']);
        
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bulk update dispositions (for setting multiple at once)
app.post('/api/disposition-mappings/bulk', async (req, res) => {
    try {
        const { mappings } = req.body; // Array of { canonical_name, disposition, approved_software_id, notes }
        const results = [];
        
        for (const mapping of mappings) {
            const result = await pool.query(`
                INSERT INTO disposition_mappings (canonical_name, disposition, approved_software_id, notes, updated_by)
                VALUES ($1, $2, $3, $4, 'admin')
                ON CONFLICT (canonical_name) 
                DO UPDATE SET 
                    disposition = EXCLUDED.disposition,
                    approved_software_id = EXCLUDED.approved_software_id,
                    notes = EXCLUDED.notes,
                    updated_at = NOW()
                RETURNING *
            `, [mapping.canonical_name, mapping.disposition, mapping.approved_software_id || null, mapping.notes]);
            results.push(result.rows[0]);
        }
        
        res.json({ success: true, updated: results.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete disposition mapping
app.delete('/api/disposition-mappings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM disposition_mappings WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get dispositions for multiple canonical names (used during analysis)
app.post('/api/disposition-mappings/lookup', async (req, res) => {
    try {
        const { canonical_names } = req.body;
        
        if (!canonical_names || canonical_names.length === 0) {
            return res.json([]);
        }
        
        const result = await pool.query(`
            SELECT dm.*, aps.name as replacement_name, aps.category as replacement_category
            FROM disposition_mappings dm
            LEFT JOIN approved_software aps ON dm.approved_software_id = aps.id
            WHERE dm.canonical_name = ANY($1)
        `, [canonical_names]);
        
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});

module.exports = app;
