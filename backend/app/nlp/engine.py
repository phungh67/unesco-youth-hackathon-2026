import numpy as np
import onnxruntime as ort
import logging
from transformers import AutoTokenizer
from typing import List, Tuple

logger = logging.getLogger("SafeHerDaemon")

class LocalNLPEngine:
    """
    The core 'Shield' intelligence layer. 
    Loads quantized ONNX models for ultra-low latency, CPU-bound inference.
    """
    def __init__(self, classifier_path: str, embedder_path: str, tokenizer_path: str):
        self.tokenizer = AutoTokenizer.from_pretrained(tokenizer_path)
        
        # consider to switch between CPU and GPU
        # privacy consideration
        providers = ['CPUExecutionProvider']
        
        self.classifier_session = ort.InferenceSession(classifier_path, providers=providers)
        self.embedder_session = ort.InferenceSession(embedder_path, providers=providers)
        
        # cache
        self.cls_input_name = self.classifier_session.get_inputs()[0].name
        self.emb_input_name = self.embedder_session.get_inputs()[0].name

    # private func
    def _tokenize(self, text: str) -> dict:
        """Helper to convert standardized text into ONNX-compatible NumPy arrays."""
        inputs = self.tokenizer(
            text,
            return_tensors="np",
            padding="max_length",
            truncation=True,
            max_length=128
        )
        return {
            "input_ids": inputs["input_ids"].astype(np.int64),
            "attention_mask": inputs["attention_mask"].astype(np.int64)
        }

    def get_toxicity_score(self, text: str) -> float:
        """
        Runs the classifier model. Returns a float between 0.0 and 1.0.
        """
        ort_inputs = self._tokenize(text)
        
        # Run inference
        outputs = self.classifier_session.run(None, ort_inputs)

        flat_probs = np.array(outputs[0]).flatten()
        # logger.info(f"[AI-TRACE] Raw Logits Output: {flat_logits}")
        max_probability = np.max(flat_probs)
        
        # Formula: $P(y=1) = \frac{1}{1 + e^{-x}}$
        final_score = float(max_probability.item())
        # logger.info(f"[AI-TRACE] Selected Logit Index 1: {target_logit:.4f} -> Sigmoid Prob: {probability:.4f}")
        
        return final_score

    def get_embedding(self, text: str) -> List[float]:
        """
        Runs the semantic embedder model for ChromaDB storage.
        """
        ort_inputs = self._tokenize(text)
        
        outputs = self.embedder_session.run(None, ort_inputs)
        # Extract the pooled output or mean-pooled state (depends on your specific ONNX export)
        token_embeddings = outputs[0][0]
        sentence_embedding = np.mean(token_embeddings, axis=0)
        
        # Normalize the vector for cosine similarity searches in ChromaDB
        norm = np.linalg.norm(sentence_embedding)
        if norm > 0:
            sentence_embedding = sentence_embedding / norm

        return sentence_embedding.tolist()

    def process_node(self, text: str) -> Tuple[float, List[float]]:
        """
        Executes both models simultaneously for a given text node.
        """
        score = self.get_toxicity_score(text)
        vector = self.get_embedding(text)
        return score, vector