from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from datetime import datetime
import uuid

# Base class
@dataclass
class TextData:
    """
    The base class representing standardized data moving through the pipeline.
    """
    element_id: str
    text_content: str
    timestamp: datetime = field(default_factory=datetime.utcnow)

# Inherit class
class RawData(TextData):
    """
    Data that has been scanned by the NLP core but has NO human feedback yet.
    """
    ai_toxicity_score: float = 0.0
    ai_predicted_label: str = "pending"
    ai_suggested_action: str = "none"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "element_id": self.element_id,
            "text_content": self.text_content,
            "ai_toxicity_score": self.ai_toxicity_score,
            "ai_predicted_label": self.ai_predicted_label,
            "timestamp": self.timestamp.isoformat()
        }
    
@dataclass
class LabeledData(RawData):
    """
    Data that has completed the 'Youth Feedback' loop. 
    """

    youth_severity_score: int = 0
    youth_action_taken: str = "none"
    
    def is_ai_corrected(self) -> bool:
        """Determines if the youth disagreed with the AI's assessment."""
        ai_normalized = self.ai_toxicity_score * 100
        return abs(ai_normalized - self.youth_severity_score) > 30

    def to_dict(self) -> Dict[str, Any]:
        base_dict = super().to_dict()
        base_dict.update({
            "youth_severity_score": self.youth_severity_score,
            "youth_action_taken": self.youth_action_taken,
            "is_ai_corrected": self.is_ai_corrected()
        })
        return base_dict

# telemetry data
@dataclass
class TelemetryData:
    """
    Strictly for macro-level, anonymized statistics. 
    Does NOT inherit from TextData to guarantee zero PII or raw text bleed.
    """
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    uptime_seconds: int = 0
    total_nodes_scanned: int = 0
    toxic_nodes_found: int = 0
    high_severity_count: int = 0
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def calculate_toxicity_ratio(self) -> float:
        if self.total_nodes_scanned == 0:
            return 0.0
        return round((self.toxic_nodes_found / self.total_nodes_scanned) * 100, 2)