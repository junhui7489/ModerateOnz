"""
Crawler for YouTube comments.

Fetches comments from YouTube videos, creates ContentItem rows,
and enqueues moderation tasks via Celery.

Run manually:   python -m app.crawler
Runs on schedule via Celery Beat (see worker.py).
"""

import logging
import os
import uuid
from datetime import datetime, timezone

import httpx
from googleapiclient.discovery import build as build_youtube
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.models import ContentItem, ContentType, ModerationStatus, User
from app.services.auth import hash_password

logger = logging.getLogger(__name__)
settings = get_settings()

# Sync DB session (crawlers run inside Celery tasks)
_db_url = settings.database_url.replace(
    "postgresql+asyncpg://", "postgresql+psycopg2://"
)
sync_engine = create_engine(_db_url, pool_size=3, max_overflow=3)
SyncSession = sessionmaker(sync_engine)


# ── Helpers ──────────────────────────────────────────────


def _get_or_create_source_user(db: Session, source: str) -> User:
    """Return a system user that owns all crawled content from a source."""
    email = f"crawler+{source}@system.internal"
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if user is None:
        user = User(
            id=uuid.uuid4(),
            email=email,
            username=f"crawler_{source}",
            hashed_password=hash_password(uuid.uuid4().hex),
            is_admin=False,
        )
        db.add(user)
        db.flush()
    return user


def _download_image(url: str) -> str | None:
    """Download an image to the uploads directory. Returns local path or None."""
    try:
        with httpx.Client(timeout=15, follow_redirects=True) as client:
            resp = client.get(url)
            resp.raise_for_status()

        content_type = resp.headers.get("content-type", "")
        if not content_type.startswith("image/"):
            return None

        ext = ".jpg"
        if "png" in content_type:
            ext = ".png"
        elif "gif" in content_type:
            ext = ".gif"
        elif "webp" in content_type:
            ext = ".webp"

        os.makedirs(settings.upload_dir, exist_ok=True)
        filename = f"{uuid.uuid4()}{ext}"
        filepath = os.path.join(settings.upload_dir, filename)

        with open(filepath, "wb") as f:
            f.write(resp.content)

        return filepath
    except Exception as e:
        logger.warning(f"Failed to download image {url}: {e}")
        return None


def _is_duplicate(db: Session, source_id: str) -> bool:
    """Check if a content item with this source tag already exists."""
    existing = db.execute(
        select(ContentItem.id).where(
            ContentItem.text_content.ilike(f"%[{source_id}%")
        )
    ).first()
    return existing is not None


def _insert_and_enqueue(
    db: Session,
    source_user: User,
    text_content: str | None,
    media_url: str | None,
    created_at: datetime,
) -> ContentItem | None:
    """Insert a ContentItem and enqueue moderation. Returns the item or None."""
    if not text_content and not media_url:
        return None

    if text_content and media_url:
        content_type = ContentType.MIXED
    elif media_url:
        content_type = ContentType.IMAGE
    else:
        content_type = ContentType.TEXT

    item = ContentItem(
        id=uuid.uuid4(),
        author_id=source_user.id,
        content_type=content_type,
        text_content=text_content,
        media_url=media_url,
        status=ModerationStatus.PENDING,
        created_at=created_at,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(item)
    db.flush()

    from app.worker import moderate_content

    moderate_content.delay(str(item.id))
    return item


# ── YouTube Comments Crawler ─────────────────────────────


def _get_youtube_client():
    """Build an authenticated YouTube Data API v3 client."""
    return build_youtube("youtube", "v3", developerKey=settings.youtube_api_key)


def _search_video_ids(youtube, query: str, max_results: int = 5) -> list[str]:
    """Search YouTube for videos matching a query, return their IDs."""
    response = youtube.search().list(
        q=query,
        part="id",
        type="video",
        maxResults=max_results,
        order="date",
    ).execute()

    return [
        item["id"]["videoId"]
        for item in response.get("items", [])
        if item["id"].get("videoId")
    ]


def _crawl_comments_for_video(
    youtube, video_id: str, db: Session, source_user: User, max_comments: int
) -> int:
    """Fetch top-level comments for a video. Returns count of new items."""
    count = 0
    page_token = None

    while count < max_comments:
        try:
            response = youtube.commentThreads().list(
                part="snippet",
                videoId=video_id,
                maxResults=min(max_comments - count, 100),
                pageToken=page_token,
                order="time",
                textFormat="plainText",
            ).execute()
        except Exception as e:
            logger.warning(f"YouTube comments fetch failed for {video_id}: {e}")
            break

        for thread in response.get("items", []):
            snippet = thread["snippet"]["topLevelComment"]["snippet"]
            comment_id = thread["snippet"]["topLevelComment"]["id"]
            source_id = f"youtube:{comment_id}"

            if _is_duplicate(db, source_id):
                continue

            text_content = snippet.get("textDisplay", "").strip()
            if not text_content:
                continue

            author_name = snippet.get("authorDisplayName", "Unknown")
            text_content = (
                f"{text_content}\n\n"
                f"[{source_id}|v:{video_id}|author:{author_name}]"
            )

            # Parse publish time
            published_at = snippet.get("publishedAt", "")
            try:
                created_at = datetime.fromisoformat(
                    published_at.replace("Z", "+00:00")
                )
            except (ValueError, AttributeError):
                created_at = datetime.now(timezone.utc)

            # Profile image (optional — download commenter's avatar)
            media_url = None
            avatar_url = snippet.get("authorProfileImageUrl", "")
            if avatar_url:
                media_url = _download_image(avatar_url)

            item = _insert_and_enqueue(
                db, source_user, text_content, media_url, created_at
            )
            if item:
                count += 1

        page_token = response.get("nextPageToken")
        if not page_token:
            break

    return count


def crawl_youtube() -> int:
    """Fetch YouTube comments from configured videos/queries. Returns count."""
    if not settings.youtube_api_key:
        logger.warning("YouTube API key not configured — skipping")
        return 0

    youtube = _get_youtube_client()
    count = 0

    # Collect video IDs from explicit config + search queries
    video_ids: list[str] = [
        vid.strip()
        for vid in settings.youtube_video_ids.split(",")
        if vid.strip()
    ]

    search_queries = [
        q.strip()
        for q in settings.youtube_search_queries.split(",")
        if q.strip()
    ]
    for query in search_queries:
        try:
            found = _search_video_ids(youtube, query, max_results=5)
            video_ids.extend(found)
            logger.info(f"YouTube search '{query}': found {len(found)} videos")
        except Exception as e:
            logger.error(f"YouTube search '{query}' failed: {e}")

    # Deduplicate video IDs
    video_ids = list(dict.fromkeys(video_ids))

    if not video_ids:
        logger.warning("No YouTube videos to crawl — skipping")
        return 0

    with SyncSession() as db:
        source_user = _get_or_create_source_user(db, "youtube")

        for video_id in video_ids:
            try:
                n = _crawl_comments_for_video(
                    youtube,
                    video_id,
                    db,
                    source_user,
                    settings.youtube_max_comments,
                )
                count += n
                logger.info(f"YouTube video {video_id}: crawled {n} new comments")
            except Exception as e:
                logger.error(f"YouTube video {video_id} crawl failed: {e}")

        db.commit()

    logger.info(f"YouTube crawl complete — {count} new items")
    return count


# ── Run All Crawlers ─────────────────────────────────────


def run_all_crawlers() -> dict:
    """Run all configured crawlers. Returns counts per source."""
    results = {}
    results["youtube"] = crawl_youtube()
    logger.info(f"Crawl run complete: {results}")
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_all_crawlers()
