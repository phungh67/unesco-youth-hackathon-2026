class PointCalibrator:
    def __init__(self, daily_cap: int = 500, decay_rate: float = 0.1, min_decay_floor: float = 0.1):
        """
        Initializes the calibrator with anti-bot and sustainability limits.
        """
        self.daily_cap = daily_cap
        self.decay_rate = decay_rate
        self.min_decay_floor = min_decay_floor

    def calculate_rarity_multiplier(self, baseline_confidence: float) -> float:
        """
        Rewards users for finding 'undiscovered' or new harassment patterns.
        If confidence is 1.0 (very common), multiplier is 1.0.
        If confidence is 0.2 (very rare), multiplier is 1.8.
        """
        # bounded
        safe_confidence = max(0.0, min(1.0, baseline_confidence))
        return 1.0 + (1.0 - safe_confidence)

    def calculate_decay_multiplier(self, recent_flag_count: int) -> float:
        """
        Diminishing returns to prevent botting or spam-clicking.
        Reduces points by 10% per recent flag, stopping at the floor (10%).
        """
        decay_penalty = self.decay_rate * recent_flag_count
        multiplier = 1.0 - decay_penalty
        return max(self.min_decay_floor, multiplier)

    def calibrate(self, raw_points: int, baseline_confidence: float, 
                  recent_flag_count: int, current_daily_total: int) -> dict:
        """
        The main entry point. Applies multipliers and enforces the daily cap.
        """
        rarity_mult = self.calculate_rarity_multiplier(baseline_confidence)
        
        decay_mult = self.calculate_decay_multiplier(recent_flag_count)
        
        calibrated_points = int(raw_points * rarity_mult * decay_mult)
        
        points_allowed = self.daily_cap - current_daily_total
        
        if points_allowed <= 0:
            final_awarded = 0
            status = "Daily Cap Reached"
        else:
            final_awarded = min(calibrated_points, points_allowed)
            status = "Points Awarded"
            
        return {
            "final_awarded": final_awarded,
            "rarity_multiplier": round(rarity_mult, 2),
            "decay_multiplier": round(decay_mult, 2),
            "status": status
        }