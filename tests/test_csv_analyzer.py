# backend/tests/test_csv_offline.py
import pytest
import csv
import os
import sys

# Path resolution to import your app modules
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "backend"))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.nlp.factory import get_nlp_engine
from app.database.chromadb_client import ChromaClient

# Paths to your new CSV dataset and database
DATA_FILE = os.path.join(BACKEND_DIR, "data", "toxic_dataset_test.csv")
DB_PATH = os.path.join(BACKEND_DIR, "data", "chroma_db")

def load_test_cases():
    """
    Reads the CSV dataset and prepares the test cases.
    Targets 'FullSentence' for the input and 'Final level (sentence)' for the outcome.
    """
    if not os.path.exists(DATA_FILE):
        print(f"Skipping tests: Dataset not found at {DATA_FILE}")
        return []
    
    cases = []
    with open(DATA_FILE, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            text = row.get('FullSentence', '').strip()
            if not text:
                continue
            
            raw_level = row.get('Final level (sentence)', '').strip().lower()
            
            # Determine expected behavior: 'non-toxic' means safe.
            # Anything else ('low', 'medium', 'high', 'severe') expects a flag.
            is_expected_toxic = raw_level not in ['non-toxic', 'none', 'safe', '', 'nan']
            
            cases.append((text, is_expected_toxic, raw_level))
            
    return cases

# --- PyTest Fixtures (Load the AI and DB once for the whole test suite) ---

@pytest.fixture(scope="module")
def engine():
    eng = get_nlp_engine()
    print(f"\n[DEBUG] Loaded engine class: {type(eng).__name__}")
    return eng

@pytest.fixture(scope="module")
def db_client():
    print(f"\n[TEST SETUP] Connecting to local ChromaDB at {DB_PATH}...")
    return ChromaClient(local_db_path=DB_PATH)

# --- The Parameterized Test ---

@pytest.mark.parametrize("text, expected_toxic, raw_level", load_test_cases())
def test_offline_pipeline(engine, db_client, text, expected_toxic, raw_level):
    """
    Tests a single sentence from the CSV dataset.
    """
    # 1. Base AI Inference
    ai_score = engine.get_toxicity_score(text)
    
    # 2. Extract Vector Math
    vector = engine.get_embedding(text)
    
    # 3. Query the Vector Database for Community Clarification
    db_score = None
    if db_client:
        db_score = db_client.get_baseline(vector)
    
    # 4. Resolve the Final Score
    # If the DB finds a close semantic match, trust the community database. 
    # Otherwise, rely on the raw ONNX score.
    final_score = db_score if db_score is not None else ai_score    

    # 5. Determine Pipeline Action (Using your 0.50 threshold)
    is_flagged = final_score >= 0.50
    
    # 6. Expect the Outcome (Assertion)
    assert is_flagged == expected_toxic, (
        f"\nFailed on Text : '{text}'\n"
        f"Expected Toxic : {expected_toxic} (Labeled as '{raw_level}')\n"
        f"Pipeline Output: Flagged={is_flagged}\n"
        f"Breakdown      : AI={ai_score:.4f}, DB={db_score}"
    )