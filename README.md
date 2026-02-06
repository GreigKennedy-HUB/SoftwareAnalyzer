# Software Inventory Analyzer

A web-based application for processing Atera-generated software inventory spreadsheets. Built for **Hub International** to normalize, categorize, and clean software entries across client agencies.

![Hub International](public/hub-logo.png)

## Features

- **Smart File Processing**: Handles Excel (.xlsx, .xls) and CSV files with intelligent column detection
- **Auto-Detection**: Automatically extracts agency/client name from spreadsheet data
- **Pattern-Based Analysis**: Uses exclusion rules and mapping rules to categorize software
- **"Not Spam" Workflow**: Mark incorrectly excluded items for inclusion with the "Include This" button
- **Custom Categories**: Choose from predefined categories or create your own
- **Admin Panel**: Manage exclusion rules and software mappings
- **Audit Trail**: Feedback log tracks all administrative actions
- **History Tracking**: View past analyses by agency
- **CSV Export**: Download cleaned results

## Quick Start

### Prerequisites

- Node.js LTS (v18+)
- PostgreSQL 12+
- Windows Server (for production deployment)

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/GreigKennedy-HUB/SoftwareAnalyzer.git
   cd SoftwareAnalyzer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```env
   DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/software_analyzer?sslmode=disable
   PORT=3000
   NODE_ENV=development
   ```

4. Set up the database:
   ```bash
   # Create database in PostgreSQL
   psql -U postgres -c "CREATE DATABASE software_analyzer;"
   
   # Run schema
   psql -U postgres -d software_analyzer -f db/schema.sql
   ```

5. Start the server:
   ```bash
   node src/server.js
   ```

6. Open http://localhost:3000

### Production Deployment

See `SETUP_GUIDE.md` and `NSSM_GUIDE.md` for Windows Server deployment with NSSM.

## Project Structure

```
SoftwareAnalyzer/
├── public/
│   ├── index.html      # Frontend UI (self-contained)
│   └── hub-logo.png    # Company logo
├── src/
│   └── server.js       # Express API + analysis engine
├── db/
│   └── schema.sql      # PostgreSQL schema + default rules
├── .env.example        # Environment template
├── .env.production     # Production config (deployed as .env)
├── deploy.bat          # Windows deployment script
├── package.json
├── SETUP_GUIDE.md      # Deployment instructions
└── NSSM_GUIDE.md       # Service management guide
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze` | Upload and analyze spreadsheet |
| GET | `/api/exclusion-rules` | List exclusion rules |
| POST | `/api/exclusion-rules` | Add exclusion rule |
| DELETE | `/api/exclusion-rules/:id` | Delete exclusion rule |
| GET | `/api/software-mappings` | List software mappings |
| POST | `/api/software-mappings` | Add software mapping |
| DELETE | `/api/software-mappings/:id` | Delete software mapping |
| GET | `/api/feedback` | Get feedback history |
| POST | `/api/feedback` | Submit feedback |
| GET | `/api/history` | Get analysis history |

## Database Schema

- **exclusion_rules**: Patterns to filter out system software, updates, drivers
- **software_mappings**: Maps variations to canonical names with categories
- **admin_feedback**: Audit log of administrative actions
- **analysis_history**: Upload history with agency tracking

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment (development/production) | development |
| `MAX_FILE_SIZE_MB` | Max upload size | 50 |
| `UPLOAD_DIR` | Temp upload directory | ./uploads |

## Deployment Workflow

1. Edit code locally in VS Code
2. Run `deploy.bat` to copy files to server
3. Restart the NSSM service
4. Test at http://edcv-utl-idd1:8085
5. Commit changes to GitHub

## License

Proprietary - Hub International

## Support

Contact the IT Development team for support.
