import os
import logging
from transformers import AutoTokenizer
from optimum.onnxruntime import ORTModelForFeatureExtraction

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ONNX-exporter")

def export_vietnamese_sbert():
    model_id = "keepitreal/vietnamese-sbert"
    save_directory = "../data/models/vietnamese-sbert-onnx"
    
    os.makedirs(save_directory, exist_ok=True)
    logger.info(f"Downloading and converting '{model_id}' to ONNX...")

    # The 'export=True' flag tells Optimum to trace the PyTorch model and convert it to an ONNX graph
    model = ORTModelForFeatureExtraction.from_pretrained(model_id, export=True)
    tokenizer = AutoTokenizer.from_pretrained(model_id)

    # Save the ONNX model and tokenizer locally
    logger.info(f"Saving ONNX model and tokenizer to '{save_directory}'...")
    model.save_pretrained(save_directory)
    tokenizer.save_pretrained(save_directory)
    
    logger.info("Success! Your Edge-ready ONNX model is prepared.")

if __name__ == "__main__":
    export_vietnamese_sbert()