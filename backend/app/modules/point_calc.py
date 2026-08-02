from app.database.dataclasses import RawData, LabeledData
from app.database.chromadb_client import ChromaClient

# definition
class PointCalculator:
    """
    Class for the calculator - fundamental component of the Gamify feature
    """
    def __init__(self, community_weight: float = 0.7, ai_weight: float = 0.3):
        """Constructor
        
        Keyword arguments:
        community_weight(float) -- Coefficient for community feedback
        ai_weight(float) -- Coefficient for AI returned result
        Return: return an object
        """
        self.community_weight = community_weight
        self.ai_weight = ai_weight
        
    def calculate_expected_truth(self, community_baseline: float, ai_score: float) -> float:
        """Calculates the weighted baseline."""
        if community_baseline is None:
            return ai_score
        return (self.community_weight * community_baseline) + (self.ai_weight * ai_score)

    def calculate_reward(self, youth_score: float, ai_score: float, community_baseline: float) -> dict:
        """
        The main entry point for the pipeline.
        Compares the youth's reality against the Expected Truth.
        """
        expected_truth = self.calculate_expected_truth(community_baseline, ai_score)
        
        expected_truth_scaled = expected_truth * 100

        # Calculate the Delta
        delta = abs(youth_score - expected_truth_scaled)
        
        # Deviation Tiers
        points_awarded = 0
        tier = "Miss"
        
        if delta <= 10:
            points_awarded = 50
            tier = "Perfect Alignment"
        elif delta <= 25:
            points_awarded = 20
            tier = "Close Call"
            
        return {
            "points_awarded": points_awarded,
            "delta": delta,
            "tier": tier
        }