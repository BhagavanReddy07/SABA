"""
Download and cache ML models on container startup
This reduces Docker image size from 7.9GB to ~500MB
"""
import os
import sys

# Set cache directory BEFORE importing transformers
CACHE_DIR = os.getenv("TRANSFORMERS_CACHE", "/app/models")
os.makedirs(CACHE_DIR, exist_ok=True)
os.environ["TRANSFORMERS_CACHE"] = CACHE_DIR
os.environ["HF_HOME"] = CACHE_DIR

print("🚀 SABA Backend - Model Initialization")
print(f"📁 Cache directory: {CACHE_DIR}")

try:
    from sentence_transformers import SentenceTransformer
    print("✅ sentence-transformers imported")
except Exception as e:
    print(f"⚠️  sentence-transformers import warning: {e}")

try:
    from transformers import pipeline, AutoTokenizer, AutoModel
    print("✅ transformers imported")
except Exception as e:
    print(f"⚠️  transformers import warning: {e}")

# Download common models (add any specific models your project uses)
models_to_cache = [
    # Common sentence embedding model
    ("sentence-transformers", "all-MiniLM-L6-v2"),
]

print(f"\n📥 Downloading {len(models_to_cache)} models...")

for lib, model_name in models_to_cache:
    try:
        print(f"⬇️  [{lib}] {model_name}...", end=" ")
        
        if lib == "sentence-transformers":
            _ = SentenceTransformer(model_name, cache_folder=CACHE_DIR)
        elif lib == "transformers":
            _ = AutoTokenizer.from_pretrained(model_name, cache_dir=CACHE_DIR)
            _ = AutoModel.from_pretrained(model_name, cache_dir=CACHE_DIR)
            
        print("✅")
    except Exception as e:
        print(f"❌ Error: {e}")
        # Don't fail - models might download on first API call

print("\n✅ Model initialization complete!")
print("🎯 Starting SABA backend server...\n")
