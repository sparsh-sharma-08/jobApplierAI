"""
Semantic Embedding Service
Uses SentenceTransformers to encode text into dense vector embeddings.
"""
import logging
from typing import Dict, Optional
import numpy as np

logger = logging.getLogger(__name__)

class EmbeddingService:
    _instance = None
    _model = None
    
    # In-memory cache for the master resume embedding to prevent recomputing it for all 100+ jobs
    _resume_cache: Dict[int, np.ndarray] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(EmbeddingService, cls).__new__(cls)
        return cls._instance

    def _get_model(self):
        """Lazy load the transformer model to avoid blocking fast API bootup."""
        if self._model is None:
            logger.info("Initializing SentenceTransformer model (all-MiniLM-L6-v2)...")
            try:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer('all-MiniLM-L6-v2')
            except ImportError:
                logger.error("Failed to import sentence_transformers. Please install the required dependencies.")
                raise
        return self._model

    def encode(self, text: str) -> np.ndarray:
        """Encode text into a vector embedding."""
        if not text.strip():
            return np.zeros(384) # Default size for MiniLM
        model = self._get_model()
        return model.encode(text, convert_to_numpy=True)
        
    def get_resume_embedding(self, user_id: int, master_resume_text: str) -> np.ndarray:
        """Get or compute the continuous vector representation of the user's master resume."""
        # Simple cache validation (in a prod robust system, cache invalidation would be tied to profile updates)
        if user_id in self._resume_cache:
            return self._resume_cache[user_id]
            
        embedding = self.encode(master_resume_text)
        self._resume_cache[user_id] = embedding
        return embedding
        
    def clear_cache(self, user_id: int):
        """Invalidate the cache when the user updates their resume."""
        self._resume_cache.pop(user_id, None)

# Singleton instance for the app to share
embedding_service = EmbeddingService()
