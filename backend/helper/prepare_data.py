import pandas as pd
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DataPrep")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCEL_PATH = os.path.join(BASE_DIR, "data", "SafeHerVoice_Dataset_180.xlsm")
CSV_PATH = os.path.join(BASE_DIR, "data", "toxic_dataset_test.csv")

def excel_to_csv(xlsx_path: str, csv_path: str) -> None:
    """Converts the macro-enabled Excel dataset into a lightweight CSV."""
    logger.info(f"Reading labeled dataset from: {xlsx_path}")
    try:
        df = pd.read_excel(xlsx_path, engine='openpyxl')
        df.to_csv(csv_path, index=False, encoding='utf-8-sig')
        logger.info(f"Success! Optimized CSV saved to: {csv_path}")
    except Exception as e:
        logger.error(f"Failed to prepare dataset: {e}")

if __name__ == "__main__":
    os.makedirs(os.path.dirname(CSV_PATH), exist_ok=True)
    excel_to_csv(EXCEL_PATH, CSV_PATH)    