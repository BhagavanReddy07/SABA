"""
Lightweight ML models for SABA AI assistant
Using spaCy and scikit-learn instead of heavy transformers
"""
import spacy
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from typing import List, Tuple, Dict
import pickle
import os

# Initialize spaCy model
try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    print("Downloading spaCy model...")
    import subprocess
    subprocess.run(["python", "-m", "spacy", "download", "en_core_web_sm"])
    nlp = spacy.load("en_core_web_sm")

# Intent classification (lightweight)
class IntentClassifier:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(max_features=1000)
        self.classifier = MultinomialNB()
        self.is_trained = False
        
        # Default intents for your AI assistant
        self.intents = {
            'greeting': ['hello', 'hi', 'hey', 'good morning', 'good evening'],
            'task': ['remind me', 'create task', 'add reminder', 'schedule', 'todo'],
            'memory': ['remember', 'store', 'save this', 'note that'],
            'query': ['what is', 'tell me about', 'explain', 'how to'],
            'goodbye': ['bye', 'goodbye', 'see you', 'exit']
        }
        
        # Auto-train on default intents
        self._train_default()
    
    def _train_default(self):
        """Train on default intents"""
        X = []
        y = []
        for intent, examples in self.intents.items():
            X.extend(examples)
            y.extend([intent] * len(examples))
        
        if X:
            X_vec = self.vectorizer.fit_transform(X)
            self.classifier.fit(X_vec, y)
            self.is_trained = True
    
    def predict(self, text: str) -> Tuple[str, float]:
        """Predict intent with confidence"""
        if not self.is_trained:
            return "unknown", 0.0
        
        X_vec = self.vectorizer.transform([text.lower()])
        intent = self.classifier.predict(X_vec)[0]
        proba = self.classifier.predict_proba(X_vec).max()
        return intent, float(proba)

# NER with spaCy (lightweight, built-in)
def extract_entities(text: str) -> List[Tuple[str, str]]:
    """
    Extract named entities from text
    Returns list of (entity_text, entity_type) tuples
    """
    doc = nlp(text)
    return [(ent.text, ent.label_) for ent in doc.ents]

# Initialize global classifier
intent_classifier = IntentClassifier()

def generate_response(prompt: str) -> str:
    """
    Generate AI response (placeholder for LLM integration)
    You can integrate with Gemini/OpenAI API here
    """
    # Detect intent
    intent, confidence = intent_classifier.predict(prompt)
    
    # Extract entities
    entities = extract_entities(prompt)
    
    # Simple rule-based responses
    if intent == 'greeting':
        return f"Hello! I'm SABA, your AI assistant. How can I help you today?"
    elif intent == 'task':
        return f"I'll help you create a task. What would you like to be reminded about?"
    elif intent == 'memory':
        return f"I've noted that down. I'll remember this for you."
    elif intent == 'query':
        return f"Let me help you with that. [Intent: {intent}, Confidence: {confidence:.2f}]"
    elif intent == 'goodbye':
        return f"Goodbye! Have a great day!"
    else:
        return f"I received your message: {prompt[:50]}..."

# Export functions for use in API
__all__ = ['generate_response', 'extract_entities', 'intent_classifier']
