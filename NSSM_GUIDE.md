# NSSM Service Management Guide

## Software Inventory Analyzer - Windows Service

This application runs as a Windows service using NSSM (Non-Sucking Service Manager).

---

## NSSM Location

```
C:\Program Files\nssm\nssm-2.24-101-g897c7ad\win64\nssm.exe
```

For convenience, you can add this to your PATH or create a shortcut.

---

## Common Commands

Open **Command Prompt as Administrator** on the server (edcv-utl-idd1) and run:

### Restart Service (after deploying code changes)
```cmd
"C:\Program Files\nssm\nssm-2.24-101-g897c7ad\win64\nssm.exe" restart SoftwareAnalyzer
```

### Stop Service
```cmd
"C:\Program Files\nssm\nssm-2.24-101-g897c7ad\win64\nssm.exe" stop SoftwareAnalyzer
```

### Start Service
```cmd
"C:\Program Files\nssm\nssm-2.24-101-g897c7ad\win64\nssm.exe" start SoftwareAnalyzer
```

### Check Service Status
```cmd
"C:\Program Files\nssm\nssm-2.24-101-g897c7ad\win64\nssm.exe" status SoftwareAnalyzer
```

### Edit Service Configuration (opens GUI)
```cmd
"C:\Program Files\nssm\nssm-2.24-101-g897c7ad\win64\nssm.exe" edit SoftwareAnalyzer
```

### Remove Service (uninstall)
```cmd
"C:\Program Files\nssm\nssm-2.24-101-g897c7ad\win64\nssm.exe" remove SoftwareAnalyzer confirm
```

---

## Service Configuration

| Setting | Value |
|---------|-------|
| **Service Name** | SoftwareAnalyzer |
| **Executable** | `C:\Program Files\nodejs\node.exe` |
| **Startup Directory** | `C:\inetpub\wwwroot\SoftwareAnalyzer` |
| **Arguments** | `src/server.js` |
| **Port** | 8085 |

---

## Deployment Workflow

1. Make code changes locally in VS Code
2. Run `deploy.bat` to copy files to server
3. Restart the service:
   ```cmd
   "C:\Program Files\nssm\nssm-2.24-101-g897c7ad\win64\nssm.exe" restart SoftwareAnalyzer
   ```
4. Test at `http://edcv-utl-idd1:8085`

---

## Viewing Logs

NSSM can be configured to capture stdout/stderr to log files.

### Add Logging (one-time setup)
```cmd
"C:\Program Files\nssm\nssm-2.24-101-g897c7ad\win64\nssm.exe" set SoftwareAnalyzer AppStdout C:\inetpub\wwwroot\SoftwareAnalyzer\logs\service.log
"C:\Program Files\nssm\nssm-2.24-101-g897c7ad\win64\nssm.exe" set SoftwareAnalyzer AppStderr C:\inetpub\wwwroot\SoftwareAnalyzer\logs\error.log
```

Create the logs folder first:
```cmd
mkdir C:\inetpub\wwwroot\SoftwareAnalyzer\logs
```

Then restart the service for logging to take effect.

### View Logs
```cmd
type C:\inetpub\wwwroot\SoftwareAnalyzer\logs\service.log
type C:\inetpub\wwwroot\SoftwareAnalyzer\logs\error.log
```

---

## Troubleshooting

### Service won't start
1. Check the status: `nssm status SoftwareAnalyzer`
2. Check Windows Event Viewer → Windows Logs → Application
3. Try running manually to see errors:
   ```cmd
   cd C:\inetpub\wwwroot\SoftwareAnalyzer
   node src/server.js
   ```

### Port already in use
Another process is using port 8085. Find it:
```cmd
netstat -ano | findstr :8085
```

### Service starts but app not accessible
- Check firewall rule exists for port 8085
- Verify .env file has correct DATABASE_URL and PORT=8085

---

## Windows Services Alternative

You can also manage the service through Windows Services GUI:

1. Press `Win + R`, type `services.msc`, press Enter
2. Find **SoftwareAnalyzer** in the list
3. Right-click to Start, Stop, or Restart

---

## Quick Reference Card

| Action | Command |
|--------|---------|
| Start | `nssm start SoftwareAnalyzer` |
| Stop | `nssm stop SoftwareAnalyzer` |
| Restart | `nssm restart SoftwareAnalyzer` |
| Status | `nssm status SoftwareAnalyzer` |
| Edit | `nssm edit SoftwareAnalyzer` |
| Remove | `nssm remove SoftwareAnalyzer confirm` |

*(Replace `nssm` with the full path if not in PATH)*
