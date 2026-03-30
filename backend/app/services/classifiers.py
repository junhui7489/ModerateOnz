"""
ML classification services for content moderation.

This module provides text toxicity classification, image safety classification,
and sentiment analysis. Models are loaded lazily on first use.

For production, swap the local HuggingFace models with API calls
(OpenAI Moderation API, Google Vision, etc.) for better scalability.
"""

import logging
import re
from dataclasses import dataclass
from transformers import pipeline, Pipeline
from PIL import Image
import io

logger = logging.getLogger(__name__)


@dataclass
class ClassificationResult:
    category: str
    confidence: float
    model_name: str
    details: str | None = None


# ── Lazy model singletons ─────────────────────────────

_text_classifier: Pipeline | None = None
_sentiment_classifier: Pipeline | None = None
_image_classifier: Pipeline | None = None


def preload_models():
    """Load text and sentiment models eagerly so the first task doesn't wait."""
    logger.info("Preloading ML models...")
    _get_text_classifier()
    _get_sentiment_classifier()
    logger.info("ML models ready.")


def _get_text_classifier() -> Pipeline:
    global _text_classifier
    if _text_classifier is None:
        logger.info("Loading text toxicity model...")
        _text_classifier = pipeline(
            "text-classification",
            model="unitary/toxic-bert",
            top_k=None,
        )
    return _text_classifier


def _get_sentiment_classifier() -> Pipeline:
    global _sentiment_classifier
    if _sentiment_classifier is None:
        logger.info("Loading sentiment model...")
        _sentiment_classifier = pipeline(
            "sentiment-analysis",
            model="distilbert-base-uncased-finetuned-sst-2-english",
        )
    return _sentiment_classifier


def _get_image_classifier() -> Pipeline:
    global _image_classifier
    if _image_classifier is None:
        logger.info("Loading image safety model...")
        _image_classifier = pipeline(
            "image-classification",
            model="Falconsai/nsfw_image_detection",
        )
    return _image_classifier


# ── Toxicity thresholds ───────────────────────────────

TOXICITY_LABELS = {
    "toxic": "toxicity",
    "severe_toxic": "toxicity",
    "obscene": "nsfw",
    "threat": "violence",
    "insult": "toxicity",
    "identity_hate": "hate_speech",
}

FLAG_THRESHOLD = 0.75
AUTO_APPROVE_THRESHOLD = 0.15

# Source tag pattern appended by the crawler — must be stripped before classification
_SOURCE_TAG_RE = re.compile(r"\n\n\[youtube:[^\]]+\]$")


def _clean_text(text: str) -> str:
    """Remove crawler source tags so they don't pollute model input."""
    return _SOURCE_TAG_RE.sub("", text).strip()


# ── Public API ────────────────────────────────────────

def classify_text(text: str) -> list[ClassificationResult]:
    """Run toxicity + sentiment analysis on text content."""
    results: list[ClassificationResult] = []
    clean = _clean_text(text)

    # Toxicity detection
    classifier = _get_text_classifier()
    predictions = classifier(clean[:512])  # truncate for model input limit

    if predictions and isinstance(predictions[0], list):
        predictions = predictions[0]

    # Only consider labels that map to a toxic category (not just the highest score)
    toxic_hits: list[tuple[str, float]] = []
    for pred in predictions:
        label = pred["label"].lower()
        score = pred["score"]
        if label in TOXICITY_LABELS and score >= FLAG_THRESHOLD:
            toxic_hits.append((label, score))

    if toxic_hits:
        # Pick the highest-confidence toxic label
        toxic_hits.sort(key=lambda x: x[1], reverse=True)
        top_label, top_score = toxic_hits[0]
        mapped = TOXICITY_LABELS[top_label]
        results.append(ClassificationResult(
            category=mapped,
            confidence=round(top_score, 4),
            model_name="toxic-bert",
            details=f"Detected {mapped} ({top_label}) with score {top_score:.4f}",
        ))
    else:
        # No toxic label above threshold — find the max toxic score for reporting
        max_score = max((p["score"] for p in predictions if p["label"].lower() in TOXICITY_LABELS), default=0.0)
        results.append(ClassificationResult(
            category="clean",
            confidence=round(1 - max_score, 4),
            model_name="toxic-bert",
            details="No toxicity detected",
        ))

    # Sentiment analysis — informational only, does NOT flag as toxic
    sentiment_clf = _get_sentiment_classifier()
    sentiment = sentiment_clf(clean[:512])[0]
    results.append(ClassificationResult(
        category="clean",
        confidence=round(sentiment["score"], 4),
        model_name="distilbert-sentiment",
        details=f"Sentiment: {sentiment['label']} ({sentiment['score']:.4f})",
    ))

    # Spam heuristics (simple rule-based, extend as needed)
    spam_score = _check_spam_heuristics(clean)
    if spam_score > FLAG_THRESHOLD:
        results.append(ClassificationResult(
            category="spam",
            confidence=round(spam_score, 4),
            model_name="spam-heuristic-v1",
            details="Spam patterns detected",
        ))

    return results


def classify_image(image_bytes: bytes) -> list[ClassificationResult]:
    """Run NSFW / safety classification on an image."""
    results: list[ClassificationResult] = []

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        classifier = _get_image_classifier()
        predictions = classifier(image)

        for pred in predictions:
            label = pred["label"].lower()
            score = pred["score"]

            if label == "nsfw" and score >= FLAG_THRESHOLD:
                results.append(ClassificationResult(
                    category="nsfw",
                    confidence=round(score, 4),
                    model_name="nsfw-image-detector",
                    details=f"NSFW content detected with score {score:.4f}",
                ))
            elif label == "normal" and score >= (1 - AUTO_APPROVE_THRESHOLD):
                results.append(ClassificationResult(
                    category="clean",
                    confidence=round(score, 4),
                    model_name="nsfw-image-detector",
                    details="Image appears safe",
                ))
    except Exception as e:
        logger.error(f"Image classification failed: {e}")
        results.append(ClassificationResult(
            category="clean",
            confidence=0.0,
            model_name="nsfw-image-detector",
            details=f"Classification error: {str(e)}",
        ))

    return results


def _check_spam_heuristics(text: str) -> float:
    """Simple rule-based spam scoring. Replace with ML model in production."""
    score = 0.0
    lower = text.lower()

    spam_phrases = [
        "buy now", "click here", "free money", "act now",
        "limited time", "dm for", "follow for follow",
        "100% real", "make money fast", "congratulations you won",
    ]

    for phrase in spam_phrases:
        if phrase in lower:
            score += 0.25

    # Excessive caps
    if len(text) > 10:
        caps_ratio = sum(1 for c in text if c.isupper()) / len(text)
        if caps_ratio > 0.6:
            score += 0.2

    # Excessive repeated characters
    if any(c * 5 in lower for c in "abcdefghijklmnopqrstuvwxyz!?"):
        score += 0.15

    # URL density
    url_count = lower.count("http://") + lower.count("https://") + lower.count("www.")
    if url_count >= 3:
        score += 0.3

    return min(score, 1.0)
