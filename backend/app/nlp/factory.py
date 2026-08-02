# app/nlp/factory.py
import os
import logging
from app.nlp.engine import LocalNLPEngine
from app.nlp.mock_engine import MockNLPEngine

logger = logging.getLogger("SafeHerDaemon")

def get_nlp_engine():
    """
    Factory to instantiate the appropriate engine based on APP_ENV.
    """
    app_env = os.getenv("APP_ENV", "dev").lower()
    
    if app_env == "prd":
        logger.info("Instantiating PRODUCTION engine (ONNX).")
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        return LocalNLPEngine(
            classifier_path=os.path.join(base_dir, "data", "models", "phobert_hate.onnx"),
            embedder_path=os.path.join(base_dir, "data", "models", "vietnamese-sbert-onnx", "model.onnx"),
            tokenizer_path=os.path.join(base_dir, "data", "models", "tokenizer")
        )
    else:
        logger.info("Instantiating MOCK engine for DEV/TEST environment.")
        return MockNLPEngine()