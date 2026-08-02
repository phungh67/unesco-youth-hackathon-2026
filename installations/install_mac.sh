#!/bin/bash

echo "========================================================"
echo "                     DISCLAIMER"
echo "========================================================"
echo "This script will verify, download, and install:"
echo "  1. Git (if not installed)"
echo "  2. Python 3 (if not installed)"
echo "  3. SafeHer Engine Repository"
echo "  4. Local NLP Models"
echo "  5. Backend Python Dependencies"
echo ""
echo "Press ENTER to agree and begin installation..."
echo "========================================================"
read -r

echo ""
echo "========================================================"
echo "                 INSTALLATION STEPS"
echo "========================================================"
echo "  Step 1: Check and auto-install Git & Python"
echo "  Step 2: Clone repository"
echo "  Step 3: Download NLP model file"
echo "  Step 4: Create virtual environment & install libraries"
echo "  Step 5: Run database/service initialization"
echo "  Step 6: Launch entrypoint server"
echo "========================================================"
echo "Press ENTER to continue..."
read -r

# ----------------------------------------------------------
# STEP 1: CHECK & INSTALL MISSING SOFTWARE
# ----------------------------------------------------------
echo ""
echo "[1/6] Checking required software..."

# Check Homebrew on macOS if needed
if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command -v brew &> /dev/null; then
        echo "[!] Homebrew not found. Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
fi

# Check Git
if ! command -v git &> /dev/null; then
    echo "[!] Git is missing. Installing Git..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install git
    elif command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y git
    fi
    echo "[+] Git installed successfully!"
else
    echo "[+] Git is already installed."
fi

# Check Python3
if ! command -v python3 &> /dev/null; then
    echo "[!] Python3 is missing. Installing Python3..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install python
    elif command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y python3 python3-venv python3-pip
    fi
    echo "[+] Python3 installed successfully!"
else
    echo "[+] Python3 is already installed."
fi

# ----------------------------------------------------------
# STEP 2: CLONE REPOSITORY
# ----------------------------------------------------------
echo ""
echo "[2/6] Cloning Repository..."
# Replace with your actual GitHub/GitLab URL
git clone "https://github.com/your-username/safeher-engine.git" safeher-engine
cd safeher-engine || exit

# ----------------------------------------------------------
# STEP 3: DOWNLOAD NLP MODEL
# ----------------------------------------------------------
echo ""
echo "[3/6] Downloading NLP Model..."
# Replace URL with your actual model URL
# curl -L -o my_nlp_model.bin "https://your-model-url.com/model.bin"
echo "[+] NLP Model downloaded."

# ----------------------------------------------------------
# STEP 4: VIRTUAL ENVIRONMENT & DEPENDENCIES
# ----------------------------------------------------------
echo ""
echo "[4/6] Setting up Python Environment & Dependencies..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
python3 -m pip install --upgrade pip
pip install -r requirements.txt

# ----------------------------------------------------------
# STEP 5: INITIALIZATION SERVICE
# ----------------------------------------------------------
echo ""
echo "[5/6] Executing Initialization Script..."
python3 -c "import helper; helper.initscript()"

# ----------------------------------------------------------
# STEP 6: LAUNCH BACKEND
# ----------------------------------------------------------
echo ""
echo "========================================================"
echo "[6/6] INSTALLATION COMPLETE! Starting Server..."
echo "========================================================"
python3 entrypoint.py