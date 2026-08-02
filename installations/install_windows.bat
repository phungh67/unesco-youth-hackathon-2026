@echo off
setlocal enableextensions enabledelayedexpansion

echo ========================================================
echo                      DISCLAIMER
echo ========================================================
echo This script will verify, download, and install:
echo   1. Git and Python 3.10 (if missing)
echo   2. SafeHer Engine Repository
echo   3. ONNX Models (phobert_hate)
echo   4. SBERT Embedding Model (via export_onnx.py)
echo   5. HuggingFace Tokenizers (via downloader.py)
echo   6. Backend Python Dependencies
echo.
echo Press any key to accept and proceed...
echo ========================================================
pause >nul

:: ----------------------------------------------------------
:: STEP 1: CHECK & INSTALL MISSING SOFTWARE
:: ----------------------------------------------------------
echo.
echo [1/8] Checking required software...

git --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [!] Git is missing. Downloading Git installer...
    curl -L -o git_installer.exe "https://github.com/git-for-windows/git/releases/download/v2.44.0.windows.1/Git-2.44.0-64-bit.exe"
    start /wait git_installer.exe /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS
    del git_installer.exe
    set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
)

python --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo [!] Python is missing. Downloading Python 3.10...
    curl -L -o python_installer.exe "https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe"
    start /wait python_installer.exe /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
    del python_installer.exe
    set "PATH=%LocalAppData%\Programs\Python\Python310;%LocalAppData%\Programs\Python\Python310\Scripts;%PATH%"
)

:: ----------------------------------------------------------
:: STEP 2: CLONE REPOSITORY & NAVIGATE
:: ----------------------------------------------------------
echo.
echo [2/8] Cloning Repository...
git clone "https://github.com/phungh67/unesco-youth-hackathon-2026.git" safeher-engine
cd safeher-engine\backend

:: ----------------------------------------------------------
:: STEP 3: CREATE DIRECTORIES & DOWNLOAD ONNX MODELS
:: ----------------------------------------------------------
echo.
echo [3/8] Setting up model directories and downloading weights...
IF NOT EXIST "data\models" mkdir "data\models"

:: Download ONNX model files into backend\data\models\
:: curl -L -o "data\models\phobert_hate.onnx" "https://your-model-url.com/phobert_hate.onnx"
:: curl -L -o "data\models\phobert_hate.onnx.data" "https://your-model-url.com/phobert_hate.onnx.data"
echo [+] ONNX Models placed in backend\data\models\

:: ----------------------------------------------------------
:: STEP 4: VIRTUAL ENVIRONMENT & DEPENDENCIES
:: ----------------------------------------------------------
echo.
echo [4/8] Setting up Python Environment & Dependencies...
IF NOT EXIST "venv" (
    python -m venv venv
)
call venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

:: ----------------------------------------------------------
:: STEP 5: EXPORT SBERT EMBEDDING MODEL
:: ----------------------------------------------------------
echo.
echo [5/8] Running helper/export_onnx.py (Exporting SBERT Embedding Model)...
python helper\export_onnx.py

:: ----------------------------------------------------------
:: STEP 6: RUN DOWNLOADER SCRIPT
:: ----------------------------------------------------------
echo.
echo [6/8] Running downloader.py (Installing Tokenizers/Embeddings)...
python downloader.py

:: ----------------------------------------------------------
:: STEP 7: DATABASE SEEDING
:: ----------------------------------------------------------
echo.
echo [7/8] Seeding the local ChromaDB database...
python helper\db_seeding.py

:: ----------------------------------------------------------
:: STEP 8: LAUNCH BACKEND
:: ----------------------------------------------------------
echo.
echo ========================================================
echo [8/8] INSTALLATION COMPLETE! Starting Server...
echo ========================================================
python entrypoint.py

pause