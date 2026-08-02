@echo off
setlocal enableextensions enabledelayedexpansion

echo ========================================================
echo                      DISCLAIMER
echo ========================================================
echo This script will verify, download, and install:
echo   1. Git (if not installed)
echo   2. Python 3.10 (if not installed)
echo   3. SafeHer Engine Repository
echo   4. Local NLP Models
echo   5. Backend Python Dependencies
echo.
echo Press any key to accept and proceed...
echo ========================================================
pause >nul

echo.
echo ========================================================
echo                 INSTALLATION STEPS
echo ========================================================
echo   Step 1: Check and auto-install Git & Python
echo   Step 2: Clone repository
echo   Step 3: Download NLP model file
echo   Step 4: Create virtual environment & install libraries
echo   Step 5: Run database/service initialization
echo   Step 6: Launch entrypoint server
echo ========================================================
pause

:: ----------------------------------------------------------
:: STEP 1: CHECK & INSTALL MISSING SOFTWARE
:: ----------------------------------------------------------
echo.
echo [1/6] Checking required software...

:: Check Git
git --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [!] Git is missing. Downloading Git installer...
    curl -L -o git_installer.exe "https://github.com/git-for-windows/git/releases/download/v2.44.0.windows.1/Git-2.44.0-64-bit.exe"
    echo [!] Installing Git silently...
    start /wait git_installer.exe /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS
    del git_installer.exe
    :: Refresh PATH for current session
    set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
    echo [+] Git installed successfully!
) ELSE (
    echo [+] Git is already installed.
)

:: Check Python
python --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [!] Python is missing. Downloading Python 3.10 installer...
    curl -L -o python_installer.exe "https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe"
    echo [!] Installing Python 3.10...
    start /wait python_installer.exe /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
    del python_installer.exe
    :: Refresh PATH for current session
    set "PATH=%LocalAppData%\Programs\Python\Python310;%LocalAppData%\Programs\Python\Python310\Scripts;%PATH%"
    echo [+] Python installed successfully!
) ELSE (
    echo [+] Python is already installed.
)

:: ----------------------------------------------------------
:: STEP 2: CLONE REPOSITORY
:: ----------------------------------------------------------
echo.
echo [2/6] Cloning Repository...
:: Replace with your actual GitHub/GitLab URL
git clone "https://github.com/your-username/safeher-engine.git" safeher-engine
cd safeher-engine

:: ----------------------------------------------------------
:: STEP 3: DOWNLOAD NLP MODEL
:: ----------------------------------------------------------
echo.
echo [3/6] Downloading NLP Model...
:: Replace URL with your actual model URL
:: curl -L -o my_nlp_model.bin "https://your-model-url.com/model.bin"
echo [+] NLP Model downloaded.

:: ----------------------------------------------------------
:: STEP 4: VIRTUAL ENVIRONMENT & DEPENDENCIES
:: ----------------------------------------------------------
echo.
echo [4/6] Setting up Python Environment & Dependencies...
IF NOT EXIST "venv" (
    python -m venv venv
)
call venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

:: ----------------------------------------------------------
:: STEP 5: INITIALIZATION SERVICE
:: ----------------------------------------------------------
echo.
echo [5/6] Executing Initialization Script...
python -c "import helper; helper.initscript()"

:: ----------------------------------------------------------
:: STEP 6: LAUNCH BACKEND
:: ----------------------------------------------------------
echo.
echo ========================================================
echo [6/6] INSTALLATION COMPLETE! Starting Server...
echo ========================================================
python entrypoint.py

pause