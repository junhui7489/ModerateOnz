"""
Celery worker for async content moderation.

Tasks pick up content items from the queue, run them through
the ML classifiers, store results, and update content status.
"""

import logging
from uuid import UUID
from celery import Celery
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.models import ContentItem, ModerationResult, ModerationStatus, FlagCategory
from app.services.classifiers import classify_text, classify_image, FLAG_THRESHOLD

logger = logging.getLogger(__name__)
settings = get_settings()

# Celery app (uses sync Redis broker)
celery_app = Celery(
    "moderation_worker",
    broker=settings.get_celery_broker(),
    backend=settings.get_celery_backend(),
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "crawl-all-sources": {
            "task": "app.worker.crawl_sources",
            "schedule": settings.crawler_interval_minutes * 60,
        },
    },
)

# Sync engine for Celery workers (Celery doesn't support async natively)
_db_url = settings.database_url
# Convert async driver to sync for Celery
_db_url = _db_url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
sync_engine = create_engine(_db_url, pool_size=5, max_overflow=5)
SyncSession = sessionmaker(sync_engine)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def moderate_content(self, content_id: str):
    """
    Main moderation task. Runs text and/or image classifiers,
    stores results, and updates the content item status.
    """
    logger.info(f"Starting moderation for content {content_id}")

    with SyncSession() as db:
        content = db.execute(
            select(ContentItem).where(ContentItem.id == UUID(content_id))
        ).scalar_one_or_none()

        if content is None:
            logger.error(f"Content {content_id} not found")
            return {"status": "error", "detail": "Content not found"}

        all_results = []

        # ── Text classification ──────────────────
        if content.text_content:
            try:
                text_results = classify_text(content.text_content)
                for r in text_results:
                    mod_result = ModerationResult(
                        content_id=content.id,
                        category=FlagCategory(r.category),
                        confidence=r.confidence,
                        model_name=r.model_name,
                        details=r.details,
                    )
                    db.add(mod_result)
                    all_results.append(r)
            except Exception as e:
                logger.error(f"Text classification failed: {e}")
                self.retry(exc=e)

        # ── Image classification ─────────────────
        if content.media_url:
            try:
                filepath = content.media_url
                with open(filepath, "rb") as f:
                    image_bytes = f.read()

                image_results = classify_image(image_bytes)
                for r in image_results:
                    mod_result = ModerationResult(
                        content_id=content.id,
                        category=FlagCategory(r.category),
                        confidence=r.confidence,
                        model_name=r.model_name,
                        details=r.details,
                    )
                    db.add(mod_result)
                    all_results.append(r)
            except FileNotFoundError:
                logger.error(f"Media file not found: {content.media_url}")
            except Exception as e:
                logger.error(f"Image classification failed: {e}")
                self.retry(exc=e)

        # ── Determine final status ───────────────
        flagged = any(
            r.category != "clean" and r.confidence >= FLAG_THRESHOLD
            for r in all_results
        )
        high_confidence_flag = any(
            r.category != "clean" and r.confidence >= 0.85
            for r in all_results
        )

        if high_confidence_flag:
            content.status = ModerationStatus.FLAGGED
        elif flagged:
            content.status = ModerationStatus.IN_REVIEW
        else:
            content.status = ModerationStatus.APPROVED

        db.commit()

        logger.info(f"Content {content_id} moderated → {content.status.value}")
        return {
            "content_id": content_id,
            "status": content.status.value,
            "results_count": len(all_results),
        }


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def crawl_sources(self):
    """Periodic task: crawl Reddit and Twitter for new content."""
    from app.crawler import run_all_crawlers

    try:
        results = run_all_crawlers()
        logger.info(f"Crawl task complete: {results}")
        return results
    except Exception as e:
        logger.error(f"Crawl task failed: {e}")
        self.retry(exc=e)
