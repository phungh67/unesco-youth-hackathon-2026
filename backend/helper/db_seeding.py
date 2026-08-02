# backend/scripts/seed_all_datasets.py
import os
import sys
import csv
import uuid
import logging

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.database.chromadb_client import ChromaClient
from app.nlp.factory import get_nlp_engine

DB_PATH = os.path.join(BACKEND_DIR, "data", "chroma_db")
COLLECTION_NAME = "youth_labeled_knowledge"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("UnifiedSeeder")

def seed_everything():
    logger.info("🤖 Booting NLP Engine to determine vector dimensions...")
    engine = get_nlp_engine()
    
    # Test vector generation to confirm dimension size (e.g., 768 for PhoBERT)
    sample_vector = engine.get_embedding("test dimension check")
    dim_size = len(sample_vector)
    logger.info(f"✅ NLP Engine active. Vector dimension size detected: {dim_size}")

    logger.info(f"🔌 Connecting to ChromaDB at {DB_PATH}...")
    db_client = ChromaClient(local_db_path=DB_PATH)
    
    # CRITICAL: Wipe out any existing collection with dimension mismatches
    logger.info(f"🗑️ Resetting collection '{COLLECTION_NAME}' to prevent dimension conflicts...")
    try:
        db_client.local_client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
        
    # Recreate collection fresh
    collection = db_client.local_client.get_or_create_collection(name=COLLECTION_NAME)

    # List of datasets to process in order
    datasets = [
        {"name": "Lexical Dictionary", "filename": "toxic_dataset.csv", "text_key": "Tu", "level_key": "Muc_do"},
        {"name": "Test Sentences Dataset", "filename": "toxic_dataset_test.csv", "text_key": "FullSentence", "level_key": "Final level (sentence)"}
    ]

    total_inserted = 0

    for ds in datasets:
        csv_path = os.path.join(BACKEND_DIR, "data", ds["filename"])
        if not os.path.exists(csv_path):
            logger.warning(f"⚠️ Dataset file not found: {csv_path}. Skipping.")
            continue

        logger.info(f"\n📖 Processing {ds['name']} from {ds['filename']}...")
        
        documents = []
        embeddings = []
        metadatas = []
        ids = []

        with open(csv_path, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                text = row.get(ds["text_key"], '').strip()
                if not text:
                    continue
                
                raw_level = row.get(ds["level_key"], 'none').strip().lower()
                
                # Map severity to 0-100 youth scores
                score_map = {
                    'non-toxic': 0, 'none': 0, 'safe': 0,
                    'low': 35,
                    'medium': 65,
                    'high': 90,
                    'severe': 100
                }
                youth_score = score_map.get(raw_level, 50)
                
                # Skip seeding safe rows into the toxic vector knowledge base
                if youth_score == 0:
                    continue

                documents.append(text)
                embeddings.append(engine.get_embedding(text))
                
                metadata = {
                    "source": ds["filename"],
                    "ai_score": youth_score / 100.0,
                    "youth_score": youth_score,
                    "action_taken": "flag_or_blur",
                    "cohort": "system_baseline",
                    "level": raw_level
                }
                metadatas.append(metadata)
                ids.append(f"{ds['filename'][:4]}-{uuid.uuid4().hex[:8]}")

        if documents:
            logger.info(f"🚀 Inserting {len(documents)} vectors into ChromaDB...")
            collection.upsert(
                ids=ids,
                embeddings=embeddings,
                documents=documents,
                metadatas=metadatas
            )
            total_inserted += len(documents)
            logger.info(f"✨ Successfully seeded {len(documents)} entries from {ds['filename']}.")

    logger.info(f"\n🎉 Unified Seeding Complete! Total vectors in collection: {collection.count()}")

if __name__ == "__main__":
    seed_everything()