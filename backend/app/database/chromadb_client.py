import os
import logging
import chromadb
from chromadb.config import Settings
from typing import List, Dict, Any, Optional

logger = logging.getLogger("SafeHerDaemon")

class ChromaClient:
    """
    Manages both the Local (Spoke) and Cloud (Hub) vector databases.
    Cloud syncing only occurs if explicit user consent is provided.
    """
    def __init__(self, local_db_path: str = "./data/chroma_db", cloud_url: str = None, cloud_port: int = 8000):
        # Initialize Local Client
        os.makedirs(local_db_path, exist_ok=True)
        self.local_client = chromadb.PersistentClient(
            path=local_db_path,
            settings=Settings(anonymized_telemetry=False)
        )
        self.local_collection = self.local_client.get_or_create_collection(name="youth_labeled_knowledge")
        logging.info(f"[DATABASE] Local ChromaDB initialized at {local_db_path}")

        # Initialize Cloud Client
        self.cloud_client = None
        self.cloud_collection = None
        if cloud_url:
            try:
                # Connect to a hosted ChromaDB instance (e.g., AWS, Render, or a dedicated VM)
                self.cloud_client = chromadb.HttpClient(host=cloud_url, port=cloud_port)
                self.cloud_collection = self.cloud_client.get_or_create_collection(name="global_community_knowledge")
                logging.info(f"[DATABASE] Cloud ChromaDB connected at {cloud_url}")
            except Exception as e:
                logging.info(f"[DATABASE] Failed to connect to Cloud ChromaDB: {e}")

    def insert_feedback(self, element_id: str, text: str, embedding: List[float], metadata: Dict[str, Any], opt_in: bool = False) -> bool:
        """
        Routes data based on user consent.
        """
        try:
            synced_successfully = False

            if opt_in and self.cloud_collection:
                try:
                    self._sync_to_cloud(element_id, embedding, metadata)
                    synced_successfully = True
                except Exception as e:
                    logging.warning(f"[DATABASE] Cloud sync failed (offline). Deferring upload: {e}")

            metadata["synced_to_cloud"] = synced_successfully
            metadata["opted_in"] = opt_in

            self.local_collection.upsert(
                ids=[element_id],
                embeddings=[embedding],
                documents=[text], 
                metadatas=[metadata]
            )
                
            return True
        except Exception as e:
            logging.error(f"[DATABASE] Local Insertion Error: {e}")
            return False

    def sync_from_cloud(self, n_records: int = 200) -> bool:
        """
        Dedicated function to pull the latest community consensus from the Cloud 
        and cache it locally for offline-first, zero-latency RAG.
        """
        if not self.cloud_collection:
            logger.warning("[DATABASE] Cloud not configured. Skipping community sync.")
            return False
            
        try:
            cloud_data = self.cloud_collection.get(
                limit=n_records,
                include=["embeddings", "metadatas", "documents"]
            )
            
            if not cloud_data["ids"]:
                logger.info("[DATABASE] Cloud community base is empty. Nothing to sync.")
                return True
                
            self.local_collection.upsert(
                ids=cloud_data["ids"],
                embeddings=cloud_data["embeddings"],
                documents=cloud_data["documents"],
                metadatas=cloud_data["metadatas"]
            )
            
            logger.info(f"[DATABASE] Successfully pulled {len(cloud_data['ids'])} nodes from Community Cloud.")
            return True
            
        except Exception as e:
            logger.error(f"[DATABASE] Community Pull Error: {e}")
            return False

    def get_baseline(self, embedding: List[float], n_results: int = 1, max_distance: float = 0.85):
        """
        Queries the local vector DB at inference time.
        """
        if not self.local_collection:
            return None
            
        try:
            results = self.local_collection.query(
                query_embeddings=[embedding],
                n_results=n_results,
                include=["metadatas", "distances"]
            )
            
            if not results.get("metadatas") or not results["metadatas"][0]:
                return None
                
            metadatas = results["metadatas"][0]
            distances = results.get("distances", [[float('inf')]*n_results])[0]
            
            if not metadatas or len(metadatas) == 0:
                return None

            closest_distance = distances[0]
            
            # If the closest vector match is too far away, reject it as a false positive
            if closest_distance > max_distance:
                return None

            if "youth_score" in metadatas[0]:
                return float(metadatas[0]["youth_score"]) / 100.0
                
            return None
            
        except Exception as e:
            logger.error(f"[DATABASE] Query Error: {e}")
            return None

    def _sync_to_cloud(self, element_id: str, embedding: List[float], metadata: Dict[str, Any]):
        """
        Sends vectors to the community pool WITHOUT the raw text to maintain GDPR compliance.
        """
        # Scrub identifying metadata
        safe_metadata = {
            "ai_score": metadata.get("ai_score"),
            "youth_score": metadata.get("youth_score"),
            "action_taken": metadata.get("action_taken"),
            "cohort": metadata.get("cohort", "anonymous_youth") 
        }

        self.cloud_collection.upsert(
            ids=[f"cloud_{element_id}"], 
            embeddings=[embedding],
            documents=["[REDACTED FOR PRIVACY]"],
            metadatas=[safe_metadata]
        )

    def update_baseline(self, embedding: List[float], new_baseline: float, max_distance: float = 0.1) -> bool:
        """
        Locates the closest matching vector in the local database and updates 
        its community baseline (youth_score) using the newly calculated EMA value.
        """
        try:
            results = self.local_collection.query(
                query_embeddings=[embedding],
                n_results=1
            )
            
            if not results["ids"] or len(results["ids"][0]) == 0:
                logger.warning("[DATABASE] No matching vector found to update baseline.")
                return False
                
            distances = results.get("distances", [[float('inf')]])[0]
            closest_distance = distances[0]
            
            if closest_distance > max_distance:
                logger.warning(f"[DATABASE] Nearest vector too far ({closest_distance}) to safely update baseline.")
                return False
                
            target_id = results["ids"][0][0]
            
            metadatas = results["metadatas"][0][0] if results["metadatas"] and results["metadatas"][0] else {}
            
            metadatas["youth_score"] = new_baseline
            
            self.local_collection.update(
                ids=[target_id],
                embeddings=[embedding], # Passing the embedding again ensures data integrity
                metadatas=[metadatas]
            )
            
            logger.info(f"[DATABASE] Successfully updated EMA baseline for {target_id} to {new_baseline}")
            return True
            
        except Exception as e:
            logger.error(f"[DATABASE] Failed to update baseline: {e}")
            return False