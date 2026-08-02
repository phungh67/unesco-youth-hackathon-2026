# the necessary functions for processing data
import uuid

from datetime import datetime

from typing import Dict, Any, Union
from app.database.dataclasses import RawData, LabeledData, TelemetryData

from app.modules.gamify import GamificationEngine

gamifier = GamificationEngine()

# standardize data
def standardize(raw_text: str) -> str:
    """
    Cleans and normalizes incoming text data before feeding into NLP core.
    """
    if not raw_text:
        return ""

    clean_text = " ".join(raw_text.lower().strip().split())

    return clean_text

# frame data

# ==========================================
# FRAME 1: The Intake Frame (Pre-Processing)
# ==========================================
def frame_intake(standardized_text: str, element_id: str, context_url: str) -> Dict[str, Any]:
    """
    Packs the raw data with necessary metadata BEFORE it hits the NLP core.
    Ensures that if the NLP process fails, the raw data is safely logged in the local DB.
    """
    return {
        "scan_id": str(uuid.uuid4()),
        "element_id": element_id,
        "text_content": standardized_text,
        "context_url": context_url,
        "timestamp": datetime.utcnow().isoformat(),
        "status": "awaiting_nlp_analysis"
    }

# ==========================================
# FRAME 2: The Delivery Frame (UI Bound)
# ==========================================
def frame_delivery(intake_payload: Dict[str, Any], ai_score: float, ai_action: str) -> Dict[str, Any]:
    """
    Packs the NLP results for the user's browser.
    Provides the exact metadata needed to trigger the 'aegis-feedback-tooltip'.
    """
    if ai_score >= 0.75:
        ui_level = "high"
    elif ai_score >= 0.50:
        ui_level = "warning"
    else:
        ui_level = "none"
    return {
        "element_id": intake_payload["element_id"], # Crucial for the DOM matcher
        "is_toxic": ai_score > 0.5,
        "level": "high" if ai_score > 0.75 else "warning",
        "score": round(ai_score * 100),
        "action": ai_action,
        "status": "awaiting_youth_feedback"
    }

# ==========================================
# FRAME 3: The Community Frame (Telemetry)
# ==========================================
def frame_telemetry(cohort_id: str, ai_score: float, youth_score: int) -> Dict[str, Any]:
    """
    Packs the 'youth_feedback' for the community knowledge base.
    Strips ALL text and element IDs to ensure Zero-Knowledge Aggregation.
    """
    return {
        "cohort_id": cohort_id,
        "timestamp_bucket": datetime.utcnow().strftime("%Y-%m-%dT%H:00:00Z"), # Hourly batching
        "metrics": {
            "ai_baseline_score": round(ai_score * 100),
            "youth_corrected_score": youth_score,
            "delta": abs(round(ai_score * 100) - youth_score)
        }
    }

def handle_user_submission(ws_data):
    user_id = ws_data.get("user_id", "local_user")
    ai_score = float(ws_data.get("ai_toxicity_score", 0.0))
    youth_score = int(ws_data.get("youth_severity_score", 0))
    baseline = ws_data.get("community_baseline")

    # The magic happens here in one clean line:
    frontend_payload = gamifier.process_feedback(user_id, ai_score, youth_score, baseline)
    
    # Send it back to the UI!
    return frontend_payload