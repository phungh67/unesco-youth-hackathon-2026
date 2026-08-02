from typing import List

def calculate_new_baseline(youth_score: float, current_baseline: float = None, alpha: float = 0.15) -> float:
    """
    Updates the shared knowledge baseline using an Exponential Moving Average.
    
    Formula: B_new = (alpha * Y) + ((1 - alpha) * B_old)
    
    Args:
        youth_score (float): The incoming feedback score from the youth (0.0 to 1.0 or 0 to 100).
        current_baseline (float): The existing baseline in ChromaDB.
        alpha (float): The learning rate. Default is 0.15.
        
    Returns:
        float: The newly updated baseline (B_new).
    """
    if current_baseline is None:
        return float(youth_score)
        
    # EMA Calculation
    b_new = (alpha * youth_score) + ((1.0 - alpha) * current_baseline)
    
    return round(b_new, 4)

def update_baseline_from_batch(youth_scores: List[float], current_baseline: float = None, alpha: float = 0.15) -> float:
    """
    Calculates the new community baseline based on an average of youth scores 
    collected during a specific calibration window (e.g., 1 hour).
    
    Formula: B_new = (alpha * Y_bar) + ((1 - alpha) * B_old)
    """
    if not youth_scores:
        return current_baseline 
        
    y_bar = sum(youth_scores) / len(youth_scores)
    
    if current_baseline is None:
        return round(y_bar, 4)
        
    b_new = (alpha * y_bar) + ((1.0 - alpha) * current_baseline)
    
    return round(b_new, 4)