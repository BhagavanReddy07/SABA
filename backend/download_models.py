"""
Download and cache lightweight ML models on container startup
"""
import os
import subprocess
import sys

# Set cache directory
CACHE_DIR = os.getenv("TRANSFORMERS_CACHE", "/app/models")
os.makedirs(CACHE_DIR, exist_ok=True)

print("🚀 SABA Backend - Lightweight Model Initialization")
print(f"📁 Cache directory: {CACHE_DIR}")

# Download spaCy model (lightweight NER and NLP)
print("\n📥 Downloading spaCy English model...")
try:
    subprocess.run([sys.executable, "-m", "spacy", "download", "en_core_web_sm"], check=True)
    print("✅ spaCy model downloaded successfully")
except Exception as e:
    print(f"⚠️  spaCy download warning: {e}")
    print("    Model will download on first use")

print("\n✅ Lightweight model initialization complete!")
print("🎯 Starting SABA backend server...\n")
