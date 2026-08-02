#!/bin/bash

echo "========================================================"
echo "                     DISCLAIMER"
echo "========================================================"
echo "This script will verify, download, and install:"
echo "  1. Git and Python 3 (if missing)"
echo "  2. SafeHer Engine Repository"
echo "  3. ONNX Models (phobert_hate)"
echo "  4. SBERT Embedding Model (via export_onnx.py)"
echo "  5. HuggingFace Tokenizers (via downloader.py)"
echo "  6. Backend Python Dependencies"
echo ""
echo "Press ENTER to agree and begin installation..."
echo "========================================================"
read -r

# ----------------------------------------------------------
# STEP 1: CHECK & INSTALL MISSING SOFTWARE
# ----------------------------------------------------------
echo ""
echo "[1/8] Checking required software..."

if [[ "$OSTYPE" == "darwin"* ]]; then
    if ! command -v brew &> /dev/null; then
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
fi

if ! command -v git &> /dev/null; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install git
    elif command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y git
    fi
fi

if ! command -v python3 &> /dev/null; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install python
    elif command -v apt &> /dev/null; then
        sudo apt update && sudo apt install -y python3 python3-venv python3-pip
    fi
fi

# ----------------------------------------------------------
# STEP 2: CLONE REPOSITORY & NAVIGATE
# ----------------------------------------------------------
echo ""
echo "[2/8] Cloning Repository..."
git clone "https://github.com/phungh67/unesco-youth-hackathon-2026.git" safeher-engine
cd safeher-engine/backend || exit

# ----------------------------------------------------------
# STEP 3: CREATE DIRECTORIES & DOWNLOAD ONNX MODELS
# ----------------------------------------------------------
echo ""
echo "[3/8] Setting up model directories and downloading weights..."
mkdir -p data/models

# Download ONNX model files into backend/data/models/
curl -L -o "data/models/phobert_hate.onnx" "https://drive.google.com/file/d/1gAxFHyjcLtl5NsIUMbaqy17B6glL0fVB/view?usp=sharing"
curl -L -o "data/models/phobert_hate.onnx.data" "https://drive.google.com/file/d/1vSEAZ427G1aaXEvy0TXWHzt-paWOrVHj/view?usp=sharing"
echo "[+] ONNX Models placed in backend/data/models/"

# ----------------------------------------------------------
# STEP 4: VIRTUAL ENVIRONMENT & DEPENDENCIES
# ----------------------------------------------------------
echo ""
echo "[4/8] Setting up Python Environment & Dependencies..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
python3 -m pip install --upgrade pip
pip install -r requirements.txt

# ----------------------------------------------------------
# STEP 5: EXPORT SBERT EMBEDDING MODEL
# ----------------------------------------------------------
echo ""
echo "[5/8] Running helper/export_onnx.py (Exporting SBERT Embedding Model)..."
python3 helper/export_onnx.py

# ----------------------------------------------------------
# STEP 6: RUN DOWNLOADER SCRIPT
# ----------------------------------------------------------
echo ""
echo "[6/8] Running downloader.py (Installing Tokenizers/Embeddings)..."
python3 downloader.py

# ----------------------------------------------------------
# STEP 7: DATABASE SEEDING
# ----------------------------------------------------------
echo ""
echo "[7/8] Seeding the local ChromaDB database..."
python3 helper/db_seeding.py

# ----------------------------------------------------------
# STEP 8: LAUNCH BACKEND
# ----------------------------------------------------------
echo ""
echo "========================================================"
echo "[8/8] INSTALLATION COMPLETE! Starting Server..."
echo "========================================================"
python3 entrypoint.py