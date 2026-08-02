import asyncio
import json
import websockets
import logging
import os
import uuid


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("SafeHerDaemon")

from app.nlp.helper import enqueue_scan_request, nlp_worker, get_engine
from app.database.chromadb_client import ChromaClient

from app.utils.pipeline import handle_user_submission, frame_telemetry

from app.database.math_base import calculate_new_baseline, update_baseline_from_batch

NUM_WORKERS = int(os.getenv("NLP_WORKERS", 2))

db_client = None 

async def handle_websocket(websocket):
    """
    Routes incoming WebSocket messages to either the NLP queue (for scanning)
    or the Gamification/Database pipeline (for feedback).
    """
    client_ip = websocket.remote_address[0]
    
    try:
        async for message in websocket:
            if message == "ping":
                continue 

            data = json.loads(message)
            action = data.get("action")
            tab_name = data.get("tab_name", "Unknown Tab")
            text = data.get("text", "")
            element_id = data.get("element_id", "")
            # logger.info(f"\n[TAB INDICATOR] 🌐 Active Tab: '{tab_name}'")
            # logger.info(f"[TRACE] Element ID    : {element_id}")
            # logger.info(f"[TRACE] Payload Text  : {text[:100]}..." if len(text) > 100 else f"[TRACE] Payload Text  : {text}")
            # logger.info("================================================")

            if action == "scan_text":
                # Pushes to the nlp_worker queue
                await enqueue_scan_request(websocket, data)
                
            elif action == "submit_feedback":
                raw_text = data.get("raw_text", "")
                ai_score = data.get("ai_toxicity_score", 0.0)

                youth_score = data.get("youth_severity_score", 0.0)
                
                engine = get_engine()
                vector = engine.get_embedding(raw_text)
                
                baseline = None
                if db_client:
                    baseline = db_client.get_baseline(vector)
                    
                if baseline is None:
                    baseline = ai_score
                    
                data["community_baseline"] = baseline
                
                frontend_payload = handle_user_submission(data)
                
                if db_client:
                    user_consented = data.get("opt_in", False) 
                    
                    db_client.insert_feedback(
                        element_id=data.get("element_id", str(uuid.uuid4())),
                        text=raw_text,
                        embedding=vector,
                        metadata={
                            "ai_score": data.get("ai_toxicity_score"),
                            "youth_score": data.get("youth_severity_score"),
                            "action_taken": "youth_reviewed",
                            "cohort": "local_youth_cohort_1"
                        },
                        opt_in=user_consented
                    )
                
                # baseline by stored data
                new_baseline = calculate_new_baseline(
                        youth_score=youth_score, 
                        current_baseline=baseline, 
                        alpha=0.15 # Your chosen learning rate
                    )
                
                # update
                db_client.update_baseline(
                        embedding=vector,
                        new_baseline=new_baseline
                    )

                telemetry_data = frame_telemetry(
                    cohort_id="local_youth_cohort_1",
                    ai_score=data.get("ai_toxicity_score"),
                    youth_score=data.get("youth_severity_score")
                )

                logger.info(f"[TELEMETRY GENERATED] {telemetry_data}")

                await websocket.send(json.dumps({
                    "action": "feedback_processed",
                    "data": frontend_payload
                }))
                
    except websockets.exceptions.ConnectionClosedOK:
        pass
    except Exception as e:
        logger.error(f"Unexpected Socket Error: {e}")

async def main():
    global db_client
    logger.info("Booting SafeHer Voice Local Daemon...")
    
    db_client = ChromaClient(
        local_db_path="./data/chroma_db",
        cloud_url=None 
    )

    logger.info("Syncing local knowledge base with global community...")
    db_client.sync_from_cloud(n_records=200)

    worker_tasks = [
        asyncio.create_task(nlp_worker()) for _ in range(NUM_WORKERS)
    ]
    
    host = "127.0.0.1"
    port = 8083
    
    try:
        async with websockets.serve(
            handle_websocket, 
            host, 
            port, 
            reuse_address=True 
        ) as server:
            logger.info(f"WebSocket Server actively listening on ws://{host}:{port}/scan")
            await asyncio.Future()  # Run forever
            
    except OSError as e:
        logger.error(f"Failed to bind to port {port}. Is another instance running? Error: {e}")
    finally:
        for task in worker_tasks:
            task.cancel()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Shutdown] SafeHer Voice Daemon closed by user.")