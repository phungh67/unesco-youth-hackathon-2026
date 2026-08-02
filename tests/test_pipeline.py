import pytest
import json
import asyncio
import websockets
import uuid

@pytest.mark.asyncio
async def test_websocket_full_lifecycle():
    """
    Test the complete processing and gamification pipeline using the REAL ONNX Engine.
    """
    uri = "ws://127.0.0.1:8083/scan"

    try:
        async with websockets.connect(uri) as websocket:

            # ==========================================
            # PHASE 1: Text Scanning (Path A - REAL AI)
            # ==========================================
            # Using a highly toxic Vietnamese phrase so PhoBERT confidently flags it
            scan_payload = {
                "action": "scan_text",
                "element_id": "test-node-001",
                "text": "Mày là đồ ngu xuẩn! Cút ngay đi!", # "You are a stupid idiot! Get out!"
                "tab_name": "Test Tab"
            }

            print("\n[Test] Sending scan_text payload to REAL PhoBERT...")
            await websocket.send(json.dumps(scan_payload))

            scan_response = await websocket.recv()
            scan_data = json.loads(scan_response)

            # Verify the framing pipeline kept the metadata
            assert "element_id" in scan_data
            assert scan_data["element_id"] == "test-node-001"
            
            # Check that the real AI scored it
            assert "score" in scan_data
            assert isinstance(scan_data["score"], (int, float))
            assert 0 <= scan_data["score"] <= 100
            
            print(f"[Test] Scan successful! Real PhoBERT Score: {scan_data['score']}")

            # ==========================================
            # PHASE 2: Gamified Feedback (Path B)
            # ==========================================
            # Convert the 0-100 frontend score back to a 0.0-1.0 float for the backend
            real_ai_score_float = scan_data["score"] / 100.0
            
            # Generate a fresh, random user ID for every test run to avoid duplicate badge errors
            test_user_id = f"pytest_user_{uuid.uuid4().hex[:8]}"
            
            feedback_payload = {
                "action": "submit_feedback",
                "user_id": test_user_id,
                "raw_text": "Mày là đồ ngu xuẩn! Cút ngay đi!",
                "ai_toxicity_score": real_ai_score_float,
                "youth_severity_score": scan_data["score"], # Perfect match with AI
                "community_baseline": real_ai_score_float   
            }

        assert "element_id" in data
        assert data["element_id"] == "test-123"
        assert "is_toxic" in data
        assert data["is_toxic"] is True
        assert "action" in data

        feedback_response = await websocket.recv()
        feedback_data = json.loads(feedback_response)

        # Verify the entrypoint routing
        assert feedback_data.get("action") == "feedback_processed"
            
        # Verify the Gamification Engine logic
        gamify_payload = feedback_data.get("data", {})
        assert gamify_payload.get("event_status") == "success"
            
        action_results = gamify_payload.get("action_results", {})
        user_state = gamify_payload.get("user_state", {})
        new_unlocks = gamify_payload.get("new_unlocks", {})

        # Assert they earned the badge for perfectly aligning with the AI
        assert action_results.get("classification_tier") == "Perfect Alignment"
        assert "Eagle Eye" in new_unlocks.get("badges_awarded_now", [])
        assert user_state.get("daily_points_progress") > 0
            
        print(f"[Test] Feedback successful! Earned {action_results.get('points_earned_this_round')} points.")
        print(f"[Test] Current Rank: {user_state.get('current_rank')}")

    except ConnectionRefusedError:
        pytest.fail("Connection refused. Make sure your server is running on port 8083!")