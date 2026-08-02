"""
NLP Core Module
Houses the ONNX micro-models, the engine factory, and the asynchronous queue logic.
"""
from .engine import LocalNLPEngine
from .helper import enqueue_scan_request, nlp_worker, get_engine
from .factory import get_nlp_engine

__all__ = [
    "LocalNLPEngine",
    "enqueue_scan_request",
    "nlp_worker",
    "get_engine",
    "get_nlp_engine"
]