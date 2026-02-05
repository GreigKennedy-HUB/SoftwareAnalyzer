-- Software Inventory Analyzer Database Schema
-- PostgreSQL

-- Exclusion rules table - patterns to filter out
CREATE TABLE IF NOT EXISTS exclusion_rules (
    id SERIAL PRIMARY KEY,
    pattern_type VARCHAR(20) NOT NULL CHECK (pattern_type IN ('exact', 'contains', 'startswith', 'endswith', 'regex')),
    pattern_value VARCHAR(500) NOT NULL,
    category VARCHAR(100) NOT NULL,
    reason TEXT,
    created_by VARCHAR(100) DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Software mappings table - maps variations to canonical names
CREATE TABLE IF NOT EXISTS software_mappings (
    id SERIAL PRIMARY KEY,
    original_pattern VARCHAR(500) NOT NULL,
    pattern_type VARCHAR(20) NOT NULL CHECK (pattern_type IN ('exact', 'contains', 'startswith', 'regex')),
    canonical_name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    deployment_type VARCHAR(20) CHECK (deployment_type IN ('Desktop', 'SaaS', 'Both')),
    description TEXT,
    created_by VARCHAR(100) DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Admin feedback/learning table - stores administrator explanations
CREATE TABLE IF NOT EXISTS admin_feedback (
    id SERIAL PRIMARY KEY,
    software_name VARCHAR(500) NOT NULL,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('exclude', 'include', 'categorize', 'merge', 'rename')),
    reason TEXT NOT NULL,
    suggested_category VARCHAR(100),
    suggested_canonical_name VARCHAR(255),
    suggested_deployment_type VARCHAR(20),
    applied_to_rules BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analysis history table - tracks upload sessions
CREATE TABLE IF NOT EXISTS analysis_history (
    id SERIAL PRIMARY KEY,
    upload_filename VARCHAR(255) NOT NULL,
    agency_name VARCHAR(255),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    input_count INTEGER,
    output_count INTEGER,
    excluded_count INTEGER,
    status VARCHAR(50) DEFAULT 'pending'
);

-- Insert default exclusion rules
INSERT INTO exclusion_rules (pattern_type, pattern_value, category, reason) VALUES
-- Windows Updates and KB articles
('startswith', 'Security Update for Microsoft', 'Windows Updates', 'Microsoft security patches - not business applications'),
('startswith', 'Update for Microsoft', 'Windows Updates', 'Microsoft updates - not business applications'),
('startswith', 'Definition Update for Microsoft', 'Windows Updates', 'Definition updates - not business applications'),
('contains', '(KB', 'Windows Updates', 'KB article updates - not business applications'),
('startswith', 'GDR ', 'Windows Updates', 'SQL Server General Distribution Release patches'),
('startswith', 'Update for Windows', 'Windows Updates', 'Windows system updates'),

-- OEM/Manufacturer Tools
('startswith', 'Dell ', 'OEM Tools', 'Dell manufacturer management software'),
('startswith', 'HP ', 'OEM Tools', 'HP manufacturer management software'),
('startswith', 'Lenovo ', 'OEM Tools', 'Lenovo manufacturer management software'),
('startswith', 'ASUS ', 'OEM Tools', 'ASUS manufacturer management software'),
('startswith', 'Intel(R)', 'OEM Tools', 'Intel hardware management components'),
('startswith', 'Intel®', 'OEM Tools', 'Intel hardware management components'),
('startswith', 'AMD ', 'OEM Tools', 'AMD hardware management software'),
('startswith', 'NVIDIA ', 'OEM Tools', 'NVIDIA hardware management software'),
('startswith', 'Realtek ', 'OEM Tools', 'Realtek driver/audio components'),
('contains', 'Thunderbolt', 'OEM Tools', 'Thunderbolt hardware drivers'),

-- Language Packs
('endswith', '- es-es', 'Language Packs', 'Spanish language pack variant'),
('endswith', '- fr-fr', 'Language Packs', 'French language pack variant'),
('endswith', '- de-de', 'Language Packs', 'German language pack variant'),
('endswith', '- pt-br', 'Language Packs', 'Portuguese language pack variant'),
('endswith', '- it-it', 'Language Packs', 'Italian language pack variant'),
('endswith', '- ja-jp', 'Language Packs', 'Japanese language pack variant'),
('endswith', '- zh-cn', 'Language Packs', 'Chinese language pack variant'),
('contains', 'para negocios - ', 'Language Packs', 'Spanish M365 language variant'),

-- Runtime Components
('startswith', 'Microsoft Visual C++', 'Runtime Components', 'Visual C++ redistributable - supporting component'),
('startswith', 'Microsoft .NET', 'Runtime Components', '.NET framework/runtime - supporting component'),
('startswith', 'Microsoft Windows Desktop Runtime', 'Runtime Components', 'Windows desktop runtime - supporting component'),
('startswith', 'Microsoft ASP.NET', 'Runtime Components', 'ASP.NET runtime components'),
('contains', 'Redistributable', 'Runtime Components', 'Redistributable packages - supporting components'),
('startswith', 'Microsoft System CLR Types', 'Runtime Components', 'CLR types - supporting component'),
('contains', 'Visual J#', 'Runtime Components', 'Visual J# redistributable'),

-- Driver Packages
('contains', 'Driver', 'Drivers', 'Hardware driver packages'),
('startswith', 'ExpressConnect', 'Drivers', 'Intel wireless drivers'),

-- Windows Components
('startswith', 'Windows 10 Update', 'Windows Components', 'Windows update tools'),
('startswith', 'Windows 11 Installation', 'Windows Components', 'Windows installation tools'),
('exact', 'Windows PC Health Check', 'Windows Components', 'Windows health check utility'),
('exact', 'Microsoft Update Health Tools', 'Windows Components', 'Windows update health tools'),

-- Supporting Services
('exact', 'Adobe Genuine Service', 'Supporting Services', 'Adobe licensing service - not main application'),
('exact', 'Mozilla Maintenance Service', 'Supporting Services', 'Firefox maintenance service'),
('contains', 'Machine-Wide Installer', 'Supporting Services', 'Installer service component'),

-- Misc System Tools
('exact', 'OEM Application Profile', 'System Components', 'OEM system profile'),
('startswith', 'Browser for SQL Server', 'Supporting Components', 'SQL Server browser component'),
('contains', 'Setup (English)', 'Supporting Components', 'Setup/installer component');

-- Insert default software mappings for consolidation
INSERT INTO software_mappings (pattern_type, original_pattern, canonical_name, category, deployment_type, description) VALUES
-- AMS360 consolidation
('startswith', 'AMS360 Client Rev', 'AMS360', 'Industry / LOB', 'Both', 'Insurance agency management system by Vertafore'),
('contains', 'AMS TransactNOW', 'AMS360', 'Industry / LOB', 'Both', 'AMS360 transaction processing component'),

-- Adobe consolidation
('startswith', 'Adobe Acrobat', 'Adobe Acrobat', 'Office Productivity', 'Desktop', 'PDF creation and editing software'),
('exact', 'Foxit PDF Reader', 'Foxit PDF', 'Office Productivity', 'Desktop', 'PDF reader application'),
('exact', 'Foxit PhantomPDF', 'Foxit PDF', 'Office Productivity', 'Desktop', 'PDF editor application'),
('exact', 'Foxit Reader', 'Foxit PDF', 'Office Productivity', 'Desktop', 'PDF reader application'),
('contains', 'Nuance PDF', 'Nuance PDF', 'Office Productivity', 'Desktop', 'PDF editing software'),
('exact', 'Amyuni PDF Converter', 'Amyuni PDF Converter', 'Office Productivity', 'Desktop', 'PDF conversion utility'),

-- Microsoft 365 consolidation
('startswith', 'Microsoft 365 Apps for business', 'Microsoft 365', 'Office Productivity', 'Both', 'Microsoft Office suite subscription'),
('startswith', 'Microsoft 365 -', 'Microsoft 365', 'Office Productivity', 'Both', 'Microsoft Office suite subscription'),
('startswith', 'Microsoft Office Professional', 'Microsoft Office', 'Office Productivity', 'Desktop', 'Microsoft Office suite perpetual license'),
('startswith', 'Microsoft Office Standard', 'Microsoft Office', 'Office Productivity', 'Desktop', 'Microsoft Office suite perpetual license'),
('startswith', 'Microsoft OneNote -', 'Microsoft OneNote', 'Office Productivity', 'Both', 'Microsoft note-taking application'),
('startswith', 'Microsoft Visio -', 'Microsoft Visio', 'Office Productivity', 'Desktop', 'Microsoft diagramming application'),

-- Microsoft SQL Server consolidation
('contains', 'SQL Server 2019', 'Microsoft SQL Server 2019', 'Database', 'Desktop', 'Microsoft relational database management system'),
('contains', 'SQL Server 2012', 'Microsoft SQL Server Components', 'Database', 'Desktop', 'Microsoft SQL Server supporting components'),
('startswith', 'Microsoft SQL Server Management Studio', 'SQL Server Management Studio', 'Database', 'Desktop', 'SQL Server database management interface'),
('exact', 'Microsoft SQL Server Reporting Services', 'SQL Server Reporting Services', 'Database', 'Both', 'SQL Server reporting platform'),

-- Microsoft Teams consolidation
('startswith', 'Microsoft Teams', 'Microsoft Teams', 'Communication', 'Both', 'Microsoft team collaboration and messaging platform'),

-- Browser consolidation
('startswith', 'Google Chrome', 'Google Chrome', 'Browser', 'Desktop', 'Google web browser'),
('startswith', 'Mozilla Firefox', 'Mozilla Firefox', 'Browser', 'Desktop', 'Mozilla web browser'),
('exact', 'Microsoft Edge', 'Microsoft Edge', 'Browser', 'Desktop', 'Microsoft web browser'),
('contains', 'Microsoft Edge WebView', 'Microsoft Edge WebView', 'Runtime Components', 'Desktop', 'Edge browser rendering component'),

-- Zoom consolidation
('startswith', 'Zoom Workplace', 'Zoom', 'Communication', 'Both', 'Video conferencing and collaboration platform'),

-- VPN/Remote Access consolidation
('contains', 'Cisco AnyConnect', 'Cisco AnyConnect', 'Remote Access', 'Desktop', 'Cisco VPN client for secure remote access'),
('contains', 'Cisco Secure Client', 'Cisco AnyConnect', 'Remote Access', 'Desktop', 'Cisco VPN client for secure remote access'),
('exact', 'AnyDesk', 'AnyDesk', 'Remote Access', 'Desktop', 'Remote desktop access software'),
('startswith', 'VMware Horizon', 'VMware Horizon', 'Remote Access', 'Desktop', 'Virtual desktop infrastructure client'),

-- RMM Tools
('exact', 'AteraAgent', 'Atera', 'RMM / MSP Tools', 'SaaS', 'Remote monitoring and management agent'),
('startswith', 'Datto RMM', 'Datto RMM', 'RMM / MSP Tools', 'SaaS', 'Remote monitoring and management platform'),
('exact', 'Datto Windows Agent', 'Datto RMM', 'RMM / MSP Tools', 'SaaS', 'Datto backup and RMM agent'),
('exact', 'Liongard Agent', 'Liongard', 'RMM / MSP Tools', 'SaaS', 'IT documentation and monitoring agent'),
('contains', 'ScreenConnect', 'ScreenConnect', 'Remote Access', 'Both', 'Remote support and access tool'),

-- Security
('exact', 'Norton 360', 'Norton 360', 'Security', 'Both', 'Norton antivirus and security suite'),
('exact', 'ConcealBrowse', 'ConcealBrowse', 'Security', 'SaaS', 'Secure web browser isolation'),
('exact', 'Sentinel Agent', 'SentinelOne', 'Security', 'SaaS', 'Endpoint detection and response (EDR)'),
('contains', 'Security Manager AV', 'Security Manager AV', 'Security', 'Desktop', 'Antivirus protection software'),

-- Communication
('startswith', 'Cisco Webex', 'Cisco Webex', 'Communication', 'Both', 'Video conferencing platform'),
('exact', 'Webex', 'Cisco Webex', 'Communication', 'Both', 'Video conferencing platform'),
('startswith', 'GoToMeeting', 'GoToMeeting', 'Communication', 'Both', 'Video conferencing platform'),
('exact', 'GoTo Opener', 'GoTo', 'Communication', 'Both', 'GoTo product launcher'),
('exact', 'Skype Meetings App', 'Skype', 'Communication', 'Both', 'Video calling and messaging'),

-- Backup
('exact', 'GoodSync', 'GoodSync', 'Backup / Recovery', 'Desktop', 'File synchronization and backup'),

-- Utilities
('startswith', '7-Zip', '7-Zip', 'Utilities', 'Desktop', 'File archiver and compression tool'),
('exact', 'CCleaner', 'CCleaner', 'Utilities', 'Desktop', 'System optimization and cleaning utility'),
('startswith', 'WinSCP', 'WinSCP', 'Utilities', 'Desktop', 'SFTP and SCP file transfer client'),
('startswith', 'PuTTY', 'PuTTY', 'Utilities', 'Desktop', 'SSH and Telnet client'),
('startswith', 'WizTree', 'WizTree', 'Utilities', 'Desktop', 'Disk space analyzer'),
('exact', 'WinDirStat 1.1.2', 'WinDirStat', 'Utilities', 'Desktop', 'Disk usage statistics and cleanup'),
('startswith', 'TreeSize', 'TreeSize', 'Utilities', 'Desktop', 'Disk space manager'),
('startswith', 'Notepad++', 'Notepad++', 'Utilities', 'Desktop', 'Advanced text editor'),
('startswith', 'IrfanView', 'IrfanView', 'Utilities', 'Desktop', 'Image viewer and editor'),
('exact', 'Revo Uninstaller 2.3.8', 'Revo Uninstaller', 'Utilities', 'Desktop', 'Program uninstaller tool'),

-- Network Tools
('startswith', 'Advanced IP Scanner', 'Advanced IP Scanner', 'Network / Infrastructure', 'Desktop', 'Network scanner for IP addresses'),
('startswith', 'Nmap', 'Nmap', 'Network / Infrastructure', 'Desktop', 'Network discovery and security scanner'),
('exact', 'Npcap OEM', 'Npcap', 'Network / Infrastructure', 'Desktop', 'Packet capture library'),
('exact', 'SNMPv3 agent 1.1', 'SNMPv3 Agent', 'Network / Infrastructure', 'Desktop', 'SNMP monitoring agent'),

-- Development Tools
('startswith', 'Visual Studio Community', 'Visual Studio', 'Development Tools', 'Desktop', 'Microsoft integrated development environment'),
('exact', 'Azure Data Studio', 'Azure Data Studio', 'Development Tools', 'Desktop', 'Cross-platform database tool'),
('startswith', 'Java 8', 'Java Runtime', 'Runtime Components', 'Desktop', 'Java runtime environment'),

-- Industry Specific
('startswith', 'iChannel', 'iChannel', 'Industry / LOB', 'Desktop', 'Insurance document management system'),
('exact', 'ConarciFetch', 'Conarc', 'Industry / LOB', 'Desktop', 'Insurance data integration tool'),
('exact', 'Dragon', 'Dragon NaturallySpeaking', 'Office Productivity', 'Desktop', 'Speech recognition software'),
('startswith', 'Barracuda', 'Barracuda', 'Security', 'Both', 'Email security and archiving'),
('exact', 'Dropbox', 'Dropbox', 'Cloud Storage', 'Both', 'Cloud file storage and sync'),
('exact', 'Microsoft OneDrive', 'Microsoft OneDrive', 'Cloud Storage', 'Both', 'Microsoft cloud file storage and sync'),
('exact', 'Splashtop Streamer', 'Splashtop', 'Remote Access', 'Both', 'Remote desktop access software'),
('exact', 'StreetSmart Edge®', 'StreetSmart Edge', 'Industry / LOB', 'Desktop', 'Charles Schwab trading platform'),
('exact', 'thinkorswim', 'thinkorswim', 'Industry / LOB', 'Desktop', 'TD Ameritrade trading platform');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_exclusion_rules_active ON exclusion_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_exclusion_rules_pattern_type ON exclusion_rules(pattern_type);
CREATE INDEX IF NOT EXISTS idx_software_mappings_active ON software_mappings(is_active);
CREATE INDEX IF NOT EXISTS idx_software_mappings_pattern_type ON software_mappings(pattern_type);
CREATE INDEX IF NOT EXISTS idx_admin_feedback_applied ON admin_feedback(applied_to_rules);
