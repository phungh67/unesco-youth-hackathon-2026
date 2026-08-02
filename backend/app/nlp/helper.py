import asyncio
import json
import logging
import ast
import os

from langdetect import detect, LangDetectException

from app.utils.pipeline import standardize, frame_intake, frame_delivery
from app.modules.action import analyze_text, load_toxic_words
from app.nlp.factory import get_nlp_engine

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "data", "toxic_dataset.csv"))
logger = logging.getLogger("SafeHerDaemon")

toxic_dictionary = load_toxic_words(CSV_PATH)

_nlp_engine = None

def is_vietnamese(text: str) -> bool:
    """Fast check to exclude the language that is not Vietnamese"""
    try:
        return detect(text) == 'vi'
    except LangDetectException:
        return False

def get_engine():
    global _nlp_engine
    if _nlp_engine is None:
        _nlp_engine = get_nlp_engine()
    return _nlp_engine

scan_queue = asyncio.Queue()

async def nlp_worker():
    logger.info("Background NLP worker active.")
    engine = get_engine()

    ai_score = 1.0 
    ai_action = None
    
    while True:
        ws, data = await scan_queue.get()
        try:
            if not isinstance(data, dict):
                logger.warning(f"[WORKER] Expected dict, got {type(data)}. Skipping.")
                scan_queue.task_done()
                continue

            raw_text = data.get("text", "")

            if not raw_text:
                continue

            if not is_vietnamese(raw_text):
                logger.debug(f"Skipping non-Vietnamese text: {raw_text}")
                
                delivery_payload = frame_delivery(data, ai_score=0.0, ai_action="none")
                await ws.send(json.dumps(delivery_payload))
                
                continue

            clean_text = standardize(raw_text)
            # logger.info(f"[TRACE] Standardized  : {clean_text}")
            element_id = data.get("element_id", "")
            tab_name = data.get("tab_name", "")

            # print(f"Payload with text: {clean_text}, element {element_id}, tab: {tab_name}")

            intake_data = frame_intake(clean_text, element_id, tab_name)
            
            # logical: dictionary > AI
            # print(f"Lookup material: {toxic_dictionary}")
            lexical_result = analyze_text(clean_text, toxic_dictionary)
            # logger.info(f"[TRACE] Lexical Dict  : {lexical_result}")
            # nference (Engine-agnostic)
            # print("DEBUG")
            # print(lexical_result)
            # print(type(lexical_result))

            if lexical_result["action"] == "report":
                logger.warning(f"[TRACE] OVERRIDE    : Dictionary flagged text! Bypassing AI.")
                ai_score = 1.0  
                ai_action = "blur"
            else:
                # #logger.info(f"[TRACE] PIPELINE    : Dictionary passed. Routing to PhoBERT ONNX...")
                ai_score = await asyncio.to_thread(engine.get_toxicity_score, clean_text)
                if ai_score >= 0.75:
                    ai_action = "blur"
                    logger.info(f"[TRACE] AI got needed to be review text")
                    logger.info("==============================================\n")
                elif ai_score >= 0.50: # You can lower this to 0.40 if you want it to be more sensitive
                    ai_action = "review"
                    logger.info(f"[TRACE] AI got blurred text")
                    logger.info("==============================================\n")
                else:
                    ai_action = "none"  # Completely safe text, ignore it
                # logger.info(f"[TRACE] AI Decision   : Score -> {ai_score:.4f} | Action -> {ai_action}")
            
            # Delivery
            delivery_payload = frame_delivery(intake_data, ai_score, ai_action)
            # print(delivery_payload)
            # print(type(delivery_payload))
            await ws.send(json.dumps(delivery_payload))
            
        except Exception as e:
            logger.error(f"Worker processing error: {e}")
        finally:
            scan_queue.task_done()

async def enqueue_scan_request(websocket, data: dict):
    await scan_queue.put((websocket, data)) 