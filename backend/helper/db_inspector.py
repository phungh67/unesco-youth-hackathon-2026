# backend/scripts/db_inspector.py
import chromadb
import json
import argparse
import os
import sys

# Define the path to your local ChromaDB folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Adjust this path depending on where you place this script relative to the 'data' folder
DB_PATH = os.path.abspath(os.path.join(BASE_DIR, "..", "data", "chroma_db"))

# Update this to match the exact collection name used in your ChromaClient setup
DEFAULT_COLLECTION = "youth_labeled_knowledge" 

class ChromaInspector:
    def __init__(self, db_path=DB_PATH, collection_name=DEFAULT_COLLECTION):
        if not os.path.exists(db_path):
            print(f"❌ Error: Database path not found at {db_path}")
            sys.exit(1)
            
        print(f"🔌 Connecting to ChromaDB at: {db_path}")
        self.client = chromadb.PersistentClient(path=db_path)
        
        try:
            self.collection = self.client.get_collection(name=collection_name)
            print(f"✅ Successfully connected to collection: '{collection_name}'")
            print(f"📊 Total records in database: {self.collection.count()}")
        except Exception as e:
            print(f"❌ Error connecting to collection '{collection_name}'.")
            print("Available collections in this database:")
            for c in self.client.list_collections():
                print(f"  - {c.name}")
            self.collection = None

    def peek_entries(self, limit=5):
        """Fetches the first N entries in the database without searching."""
        if not self.collection: 
            return
        results = self.collection.peek(limit=limit)
        self._print_results(results, f"PEEK RESULTS (Showing first {limit} entries)")

    def query_database(self, query_text, n_results=3):
        """Performs a semantic similarity search against the vector database."""
        if not self.collection: 
            return
        print(f"\n🔍 Searching for: '{query_text}'...")
        
        # ChromaDB automatically embeds the query_texts using the same model 
        # it used to store them (usually the default all-MiniLM-L6-v2)
        results = self.collection.query(
            query_texts=[query_text],
            n_results=n_results
        )
        self._print_results(results, f"QUERY RESULTS for '{query_text}'")

    def _print_results(self, results, title):
        print(f"\n{'='*60}\n{title}\n{'='*60}")
        
        # ChromaDB's peek() returns flat lists, query() returns lists of lists. 
        # This normalizes the data structure so we can print both easily.
        is_query = isinstance(results.get('ids', [[]])[0], list)
        
        ids = results['ids'][0] if is_query else results['ids']
        documents = results['documents'][0] if is_query else results['documents']
        metadatas = results['metadatas'][0] if is_query else results['metadatas']
        distances = results.get('distances', [[None]*len(ids)])[0] if is_query else [None]*len(ids)

        if not ids or len(ids) == 0:
            print("No results found.")
            return

        for i in range(len(ids)):
            print(f"\n🆔 ID: {ids[i]}")
            if distances[i] is not None:
                print(f"📏 Distance (Lower is closer): {distances[i]:.4f}")
            print(f"📝 Text: {documents[i]}")
            print(f"🏷️  Metadata: {json.dumps(metadatas[i], indent=2, ensure_ascii=False)}")
            print("-" * 60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SafeHer ChromaDB Inspector")
    parser.add_argument("--query", "-q", type=str, help="Text to semantic-search for in the vector database")
    parser.add_argument("--peek", "-p", type=int, help="Number of random entries to peek at", default=0)
    parser.add_argument("--collection", "-c", type=str, default=DEFAULT_COLLECTION, help="Name of the ChromaDB collection")
    
    args = parser.parse_args()
    inspector = ChromaInspector(collection_name=args.collection)

    if args.query:
        inspector.query_database(args.query)
    elif args.peek > 0:
        inspector.peek_entries(limit=args.peek)
    else:
        # Default behavior if no arguments are provided
        inspector.peek_entries(limit=3)