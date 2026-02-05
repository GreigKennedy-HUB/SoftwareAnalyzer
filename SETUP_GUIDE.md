# Software Inventory Analyzer - Setup Guide

## Your Environment
- **Local Dev:** Windows 11, VS Code, Node.js installed
- **Local Path:** `C:\dev\Software_Inventory_Analyzer`
- **Server:** edcv-utl-idd1 (IIS + PostgreSQL)
- **Database Tool:** pgAdmin 4 (on server via RDP)

> ⚠️ **IMPORTANT:** This server runs other applications!
> - Ports 80, 8080 (and possibly others) are already in use
> - Other PostgreSQL databases exist on this server
> - We'll use port **8085** for this app (verify it's free first)
> - Database name `software_analyzer` is unique to this application

---

## Step 1: Set Up Local Project Folder

1. Extract `software-inventory-analyzer.zip` to:
   ```
   C:\dev\Software_Inventory_Analyzer\
   ```

2. Copy the additional files to the same folder:
   - `deploy.bat`
   - `web.config`
   - `.env` (local development)
   - `.env.production` (server deployment)

3. Your folder should look like:
   ```
   C:\dev\Software_Inventory_Analyzer\
   ├── db\
   │   └── schema.sql
   ├── public\
   │   └── index.html
   ├── src\
   │   └── server.js
   ├── .env                 ← Local config (points to server DB)
   ├── .env.production      ← Server config (points to localhost DB)
   ├── deploy.bat
   ├── package.json
   ├── README.md
   └── web.config
   ```

---

## Step 2: Create Database (on Server via pgAdmin)

> ⚠️ **Be careful:** Other databases exist on this server. Only create/modify the `software_analyzer` database.

1. **RDP to edcv-utl-idd1**

2. **Open pgAdmin 4**

3. **Verify database doesn't exist:**
   - Expand **Databases** - make sure `software_analyzer` isn't already listed

4. **Create Database:**
   - Right-click **Databases** → **Create** → **Database...**
   - Database name: `software_analyzer`
   - Owner: `postgres` (or your preferred user)
   - Click **Save**

5. **Run Schema:**
   - Click on `software_analyzer` to select it (IMPORTANT: make sure it's selected!)
   - Open **Query Tool** (Tools menu → Query Tool)
   - The tab should say "Query - software_analyzer" to confirm you're in the right database
   - Click **Open File** icon → navigate to:
     `C:\inetpub\wwwroot\SoftwareAnalyzer\db\schema.sql`
     
     *Or copy/paste the schema.sql contents directly*
   - Click **Execute** (▶ or F5)
   - Verify: "Query returned successfully"

6. **Verify Tables Created:**
   - Expand: `software_analyzer` → `Schemas` → `public` → `Tables`
   - You should see 4 tables: `admin_feedback`, `analysis_history`, `exclusion_rules`, `software_mappings`
   - These tables exist ONLY in the `software_analyzer` database

---

## Step 3: Configure PostgreSQL for Remote Access

*This allows your local dev machine to connect to the server database.*

**On the server (edcv-utl-idd1):**

1. **Find PostgreSQL config files** (typically in `C:\Program Files\PostgreSQL\{version}\data\`)

2. **Edit `pg_hba.conf`:**
   - Look for existing entries - other apps may already have remote access configured
   - Add this line at the end (specific to our database):
   ```
   host    software_analyzer    postgres    0.0.0.0/0    scram-sha-256
   ```
   *This only grants access to the `software_analyzer` database, not others*

3. **Check `postgresql.conf`:**
   - If other apps connect remotely, `listen_addresses = '*'` may already be set
   - Only change if needed

4. **Restart PostgreSQL Service** (if you made changes):
   - Open Services (services.msc)
   - Find `postgresql-x64-{version}`
   - Right-click → Restart
   - ⚠️ This briefly interrupts ALL PostgreSQL connections

5. **Firewall:**
   - Port 5432 may already be open for other apps
   - Check before adding a duplicate rule

---

## Step 4: Configure Local Environment

1. **Open VS Code:**
   ```
   File → Open Folder → C:\dev\Software_Inventory_Analyzer
   ```

2. **Edit `.env` file** - update the password:
   ```
   DATABASE_URL=postgresql://postgres:YOUR_ACTUAL_PASSWORD@edcv-utl-idd1:5432/software_analyzer
   ```

3. **Install dependencies** (VS Code terminal: Ctrl+`):
   ```
   npm install
   ```

4. **Test the app:**
   ```
   npm start
   ```

5. **Open browser:** http://localhost:3000

6. **Try uploading** the Fenner-Esler Excel file to test!

---

## Step 5: Find an Available Port on the Server

Before deploying, check which port to use:

1. **RDP to edcv-utl-idd1**

2. **Open IIS Manager**

3. **Check existing sites:**
   - Expand the server → Sites
   - Note which ports are in use (80, 8080, etc.)

4. **Pick an unused port** - suggested: **8085**
   - Or run this in Command Prompt to see all listening ports:
   ```
   netstat -an | findstr LISTENING
   ```

---

## Step 6: Deploy to Server

1. **Edit `.env.production`** - update the password:
   ```
   DATABASE_URL=postgresql://postgres:YOUR_ACTUAL_PASSWORD@localhost:5432/software_analyzer
   ```
   *(Note: localhost because the app runs ON the server)*

2. **Run deploy.bat:**
   - Double-click `deploy.bat` or run from VS Code terminal
   - Files copy to `\\edcv-utl-idd1\c$\inetpub\wwwroot\SoftwareAnalyzer\`

3. **First time only - on the server:**
   - RDP to edcv-utl-idd1
   - Open Command Prompt as Administrator
   ```
   cd C:\inetpub\wwwroot\SoftwareAnalyzer
   npm install
   ```

4. **Set up IIS Site:**
   - Open IIS Manager
   - Right-click **Sites** → **Add Website...**
   - Site name: `SoftwareAnalyzer`
   - Physical path: `C:\inetpub\wwwroot\SoftwareAnalyzer`
   - Port: **8085** (or your chosen free port)
   - Click **OK**

5. **Test:** http://edcv-utl-idd1:8085

---

## Daily Workflow

```
┌─────────────────────────────────────────────────────────┐
│  1. Open VS Code                                        │
│     C:\dev\Software_Inventory_Analyzer                  │
│                                                         │
│  2. Start local server                                  │
│     npm start                                           │
│                                                         │
│  3. Test at http://localhost:3000                       │
│     (Uses database on edcv-utl-idd1)                    │
│                                                         │
│  4. Make changes, save, refresh browser                 │
│                                                         │
│  5. When ready to deploy:                               │
│     Run deploy.bat                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### "Cannot connect to server" in deploy.bat
- Check you can access `\\edcv-utl-idd1\c$` in File Explorer
- Verify your account has admin rights on the server

### "Connection refused" when running locally
- PostgreSQL not accepting remote connections
- Check firewall port 5432 is open
- Verify pg_hba.conf settings and restart PostgreSQL

### "Password authentication failed"
- Check password in `.env` file
- Verify the postgres user password in pgAdmin

### IIS shows error page
- Check iisnode is installed on server
- Review logs in `C:\inetpub\wwwroot\SoftwareAnalyzer\logs\`
- Ensure Node.js is installed on server

### Port already in use
- Pick a different port (8086, 8087, etc.)
- Update IIS site binding accordingly

---

## File Reference

| File | Purpose |
|------|---------|
| `.env` | Local dev config - points to SERVER database |
| `.env.production` | Server config - points to localhost database |
| `deploy.bat` | Copies files to server |
| `web.config` | IIS configuration for iisnode |
| `db/schema.sql` | Database tables and default rules |

---

## What This App Does NOT Touch

- ✓ Other IIS sites/ports (80, 8080, etc.)
- ✓ Other PostgreSQL databases
- ✓ Other application folders in inetpub
