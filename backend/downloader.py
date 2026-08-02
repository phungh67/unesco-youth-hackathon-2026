# Run this once in your terminal or a temporary script
from transformers import AutoTokenizer

print("Downloading tokenizer...")
# Assuming you are using DistilBERT for your classifier
tokenizer = AutoTokenizer.from_pretrained("vinai/phobert-base") 

# Save it to your local data folder
tokenizer.save_pretrained("./data/models/tokenizer")
print("Saved to ./data/models/tokenizer!")