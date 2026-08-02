import json
from app.modules.point_calc import PointCalculator
from app.modules.point_calibrate import PointCalibrator
from app.utils.local_database import LocalUserDB

class GamificationEngine:
    def __init__(self):
        """
        Initializes the Gamification Engine Facade.
        Completely decouples the core app from the reward subsystem.
        """
        self.calculator = PointCalculator()
        self.calibrator = PointCalibrator()
        self.db = LocalUserDB()

    def _determine_rank(self, total_points: int) -> str:
        """Helper to map total points to ranks."""
        if total_points <= 500: return "Rookie Scout"
        if total_points <= 2000: return "Truth Seeker"
        if total_points <= 5000: return "Digital Sentinel"
        return "Vanguard of MIL"

    def process_feedback(self, user_id: str, ai_score: float, youth_score: float, baseline_confidence: float) -> dict:
        """
        The master controller function. 
        Takes raw pipeline data and returns the frontend JSON payload.
        """
        state = self.db.get_user_state(user_id)
        
        calc_result = self.calculator.calculate_reward(youth_score, ai_score, baseline_confidence)
        
        cal_result = self.calibrator.calibrate(
            raw_points=calc_result["points_awarded"],
            baseline_confidence=baseline_confidence,
            recent_flag_count=state["recent_flags"],
            current_daily_total=state["daily_points"]
        )
        final_awarded = cal_result["final_awarded"]
        
        new_badges_earned = []
        if calc_result["delta"] <= 10:
            new_badges_earned.append("Eagle Eye") 
        if cal_result["rarity_multiplier"] >= 1.5:
            new_badges_earned.append("Pioneer")
        if state["recent_flags"] >= 4 and cal_result["decay_multiplier"] == 1.0:
            new_badges_earned.append("Steady Shield")
            
        unlocked_badges = json.loads(state.get("unlocked_badges", "[]"))
        actual_new_badges = [b for b in new_badges_earned if b not in unlocked_badges]
        unlocked_badges.extend(actual_new_badges)
        
        new_total_points = state.get("total_points", 0) + final_awarded
        new_rank = self._determine_rank(new_total_points)
        rank_up = new_rank != state.get("current_rank", "Rookie Scout")
        
        self.db.update_user_state(
            user_id=user_id,
            new_points=final_awarded,
            new_rank=new_rank,
            unlocked_badges=json.dumps(unlocked_badges)
        )
        
        return {
          "event_status": "success",
          "action_results": {
            "points_earned_this_round": final_awarded,
            "classification_tier": calc_result["tier"],
            "rarity_bonus_applied": cal_result["rarity_multiplier"] > 1.0
          },
          "user_state": {
            "daily_points_progress": state["daily_points"] + final_awarded,
            "daily_cap": self.calibrator.daily_cap,
            "total_points": new_total_points,
            "current_rank": new_rank
          },
          "new_unlocks": {
            "badges_awarded_now": actual_new_badges,
            "rank_up": rank_up
          }
        }