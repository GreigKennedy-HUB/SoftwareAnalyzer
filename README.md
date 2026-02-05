# Software Inventory Analyzer

A web-based application that processes Atera-generated software inventory spreadsheets and uses intelligent analysis to normalize, categorize, and clean software entries.

## Features

- **Upload & Analyze**: Drag-and-drop Excel file upload with instant analysis
- **Smart Consolidation**: Automatically combines version variations (e.g., AMS360 Client Rev 8/9/10/11 → AMS360)
- **Exclusion Engine**: Filters out Windows updates, OEM tools, language packs, runtime components
- **Categorization**: Groups software by function (Security, Office Productivity, RMM, etc.)
- **Deployment Classification**: Labels software as Desktop, SaaS, or Both
- **Admin Portal**: Manage exclusion rules and software mappings through the UI
- **Feedback System**: Submit explanations for exclusions/inclusions that automatically update rules
- **Export**: Download cleaned results as CSV

## Tech Stack

- **Backend**: Node.js with Express
- **Database**: PostgreSQL
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Hosting Target**: IIS (via iisnode) or standalone Node.js

## Quick Start

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 12+

### 2. Database Setup

Create a PostgreSQL database and run the schema:

```bash
# Create database
psql -U postgres -c "CREATE DATABASE software_analyzer;"

# Run schema
psql -U postgres -d software_analyzer -f db/schema.sql
```

### 3. Configure Environment

Copy the example environment file and edit with your settings:

```bash
cp .env.example .env
```

Edit `.env`:
```
DATABASE_URL=postgresql://username:password@localhost:5432/software_analyzer
PORT=3000
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run the Application

```bash
npm start
```

Open http://localhost:3000 in your browser.

## Deployment on IIS

### Option A: Using iisnode

1. Install [iisnode](https://github.com/Azure/iisnode)

2. Create `web.config` in the project root:

```xml
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="src/server.js" verb="*" modules="iisnode" />
    </handlers>
    <rewrite>
      <rules>
        <rule name="NodeInspector" patternSyntax="ECMAScript" stopProcessing="true">
          <match url="^src/server.js\/debug[\/]?" />
        </rule>
        <rule name="StaticContent">
          <action type="Rewrite" url="public{REQUEST_URI}" />
        </rule>
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="True" />
          </conditions>
          <action type="Rewrite" url="src/server.js" />
        </rule>
      </rules>
    </rewrite>
    <iisnode node_env="production" />
  </system.webServer>
</configuration>
```

3. Create an IIS website pointing to the project folder

4. Set environment variables in IIS Application Settings or use a `.env` file

### Option B: Reverse Proxy

Run Node.js as a Windows service and configure IIS as a reverse proxy:

1. Install [node-windows](https://www.npmjs.com/package/node-windows) or use NSSM

2. Configure IIS URL Rewrite to proxy to localhost:3000

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze` | Upload and analyze Excel file |
| GET | `/api/exclusion-rules` | List all exclusion rules |
| POST | `/api/exclusion-rules` | Add exclusion rule |
| PUT | `/api/exclusion-rules/:id` | Update exclusion rule |
| DELETE | `/api/exclusion-rules/:id` | Delete exclusion rule |
| GET | `/api/software-mappings` | List all software mappings |
| POST | `/api/software-mappings` | Add software mapping |
| PUT | `/api/software-mappings/:id` | Update software mapping |
| DELETE | `/api/software-mappings/:id` | Delete software mapping |
| POST | `/api/feedback` | Submit admin feedback |
| GET | `/api/feedback` | Get feedback history |
| GET | `/api/history` | Get analysis history |
| POST | `/api/export/csv` | Export results as CSV |
| GET | `/api/health` | Health check |

## Directory Structure

```
software-analyzer/
├── db/
│   └── schema.sql          # PostgreSQL schema with default rules
├── public/
│   └── index.html          # Frontend application
├── src/
│   └── server.js           # Express API server
├── uploads/                # Temporary file storage (created automatically)
├── .env.example            # Environment template
├── package.json
└── README.md
```

## Default Categories

### Exclusion Categories
- Windows Updates (KB articles, security updates)
- OEM Tools (Dell, HP, Lenovo, ASUS, Intel, AMD, NVIDIA)
- Language Packs (es-es, fr-fr, de-de, etc.)
- Runtime Components (Visual C++, .NET, CLR)
- Drivers
- Supporting Services

### Software Categories
- RMM / MSP Tools
- Security
- Office Productivity
- Network / Infrastructure
- Database
- Communication
- Remote Access
- Browser
- Development Tools
- Industry / LOB
- Backup / Recovery
- Cloud Storage
- Utilities

## Adding Custom Rules

### Via UI
1. Navigate to "Admin Rules" tab
2. Use the forms to add exclusion rules or software mappings

### Via Database
```sql
-- Add exclusion rule
INSERT INTO exclusion_rules (pattern_type, pattern_value, category, reason)
VALUES ('startswith', 'MyApp', 'Custom', 'Internal tool not needed');

-- Add software mapping
INSERT INTO software_mappings (pattern_type, original_pattern, canonical_name, category, deployment_type, description)
VALUES ('contains', 'Salesforce', 'Salesforce', 'CRM', 'SaaS', 'Customer relationship management platform');
```

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check DATABASE_URL in .env
- Ensure database exists and schema is loaded

### File Upload Issues
- Check UPLOAD_DIR exists and is writable
- Verify MAX_FILE_SIZE_MB setting

### IIS Issues
- Ensure iisnode is installed correctly
- Check IIS Application Pool identity has file permissions
- Review iisnode logs in the project folder

## License

Internal use only.
