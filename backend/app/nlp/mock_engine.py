import random
import logging
from typing import List, Tuple

logger = logging.getLogger("SafeHerDaemon")

class MockNLPEngine:
    """
    A lightweight, fake NLP engine for pipeline and UI testing.
    Requires no actual models, tokenizers, or heavy compute.
    """
    def __init__(self, *args, **kwargs):
        logging.info("[MOCK NLP] Initialized successfully. Ready for pipeline testing.")
        
        self.high_threat_keywords = ["toxic", "hate", "propaganda", "fake"]
        self.low_threat_keywords = ["mild", "annoying", "disagree"]

    def get_toxicity_score(self, text: str) -> float:
        """
        Returns predictable scores based on keywords in the text.
        """
        lower_text = text.lower()
        
        if any(word in lower_text for word in self.high_threat_keywords):
            return 0.85 + random.uniform(0.0, 0.1)
            
        if any(word in lower_text for word in self.low_threat_keywords):
            return 0.60 + random.uniform(0.0, 0.1)
            
        return random.uniform(0.0, 0.3)

    def get_embedding(self, text: str) -> List[float]:
        """
        Returns a fake 384-dimensional vector (matching all-MiniLM-L6-v2).
        Perfect for testing ChromaDB insertions and queries without math overhead.
        """
        base_val = len(text) / 100.0
        fake_vector = [base_val + (i * 0.001) for i in range(384)]
        return fake_vector

    def process_node(self, text: str) -> Tuple[float, List[float]]:
        score = self.get_toxicity_score(text)
        vector = self.get_embedding(text)
        return score, vector