@echo off
echo ========================================
echo  Software Inventory Analyzer - Deploy
echo ========================================
echo.

set SERVER=edcv-utl-idd1
set APP_PATH=\\%SERVER%\c$\inetpub\wwwroot\SoftwareAnalyzer

echo Checking server connection...
if not exist "\\%SERVER%\c$" (
    echo   ✗ Cannot connect to %SERVER%. Check network/permissions.
    pause
    exit /b 1
)
echo   ✓ Connected to %SERVER%
echo.

echo Creating directories if needed...
if not exist "%APP_PATH%" mkdir "%APP_PATH%"
if not exist "%APP_PATH%\public" mkdir "%APP_PATH%\public"
if not exist "%APP_PATH%\src" mkdir "%APP_PATH%\src"
if not exist "%APP_PATH%\db" mkdir "%APP_PATH%\db"
echo   ✓ Directories ready
echo.

echo Deploying frontend...
copy /Y "public\index.html" "%APP_PATH%\public\index.html"
if %errorlevel%==0 (echo   ✓ index.html deployed) else (echo   ✗ Failed to deploy index.html)

if exist "public\hub-logo.png" (
    copy /Y "public\hub-logo.png" "%APP_PATH%\public\hub-logo.png"
    if %errorlevel%==0 (echo   ✓ hub-logo.png deployed) else (echo   ✗ Failed to deploy hub-logo.png)
)

echo.
echo Deploying backend...
copy /Y "src\server.js" "%APP_PATH%\src\server.js"
if %errorlevel%==0 (echo   ✓ server.js deployed) else (echo   ✗ Failed to deploy server.js)

echo.
echo Deploying configuration files...
copy /Y "package.json" "%APP_PATH%\package.json"
if %errorlevel%==0 (echo   ✓ package.json deployed) else (echo   ✗ Failed to deploy package.json)

copy /Y "db\schema.sql" "%APP_PATH%\db\schema.sql"
if %errorlevel%==0 (echo   ✓ schema.sql deployed) else (echo   ✗ Failed to deploy schema.sql)

if exist "%APP_PATH%\.env" (
    echo   ! Skipped .env - already exists on server
) else if exist ".env.production" (
    copy /Y ".env.production" "%APP_PATH%\.env"
    if %errorlevel%==0 (echo   ✓ .env deployed from .env.production) else (echo   ✗ Failed to deploy .env)
) else (
    echo   ! Skipped .env - create .env.production for server config
)

if exist "web.config" (
    copy /Y "web.config" "%APP_PATH%\web.config"
    if %errorlevel%==0 (echo   ✓ web.config deployed) else (echo   ✗ Failed to deploy web.config)
)

echo.
echo ========================================
echo  Deployment complete!
echo ========================================
echo.
echo FIRST TIME SETUP on server:
echo   1. Open command prompt on %SERVER%
echo   2. cd C:\inetpub\wwwroot\SoftwareAnalyzer
echo   3. npm install
echo   4. Create .env with DATABASE_URL
echo   5. Set up IIS site on port 8085 (or another free port)
echo.
echo AFTER CODE CHANGES:
echo   - IIS should auto-restart with iisnode
echo   - Or restart the SoftwareAnalyzer site in IIS Manager
echo.
pause
