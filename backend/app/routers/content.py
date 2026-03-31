import os
import uuid
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.config import get_settings
from app.models import ContentItem, ContentType, ModerationStatus, ModerationResult, FlagCategory, AuditLog, User
from app.schemas import ContentResponse, ContentWithResults, ContentSubmit, ReviewAction
from app.services.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/content", tags=["content"])
settings = get_settings()


@router.post("/submit", response_model=ContentResponse, status_code=201)
async def submit_content(
    text_content: str | None = Form(None),
    media: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Submit content for moderation. Accepts text, image, or both."""
    if not text_content and not media:
        raise HTTPException(status_code=400, detail="Provide text_content and/or media")

    # Determine content type
    if text_content and media:
        content_type = ContentType.MIXED
    elif media:
        content_type = ContentType.IMAGE
    else:
        content_type = ContentType.TEXT

    media_url = None

    # Save uploaded media
    if media:
        max_size = settings.max_upload_size_mb * 1024 * 1024
        contents = await media.read()
        if len(contents) > max_size:
            raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_size_mb}MB limit")

        ext = os.path.splitext(media.filename or "file")[1]
        filename = f"{uuid.uuid4()}{ext}"
        filepath = os.path.join(settings.upload_dir, filename)

        os.makedirs(settings.upload_dir, exist_ok=True)
        async with aiofiles.open(filepath, "wb") as f:
            await f.write(contents)

        media_url = filepath

    # Create content record
    content = ContentItem(
        author_id=user.id,
        content_type=content_type,
        text_content=text_content,
        media_url=media_url,
        status=ModerationStatus.PENDING,
    )
    db.add(content)
    await db.commit()
    await db.refresh(content)

    # Dispatch async moderation task (lazy import to avoid loading ML deps in API)
    from app.worker import moderate_content
    moderate_content.delay(str(content.id))

    return content


@router.get("/queue", response_model=list[ContentWithResults])
async def get_review_queue(
    status: ModerationStatus | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get content items for review, optionally filtered by status."""
    query = (
        select(ContentItem)
        .options(selectinload(ContentItem.moderation_results), selectinload(ContentItem.author))
        .order_by(ContentItem.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    if status:
        query = query.where(ContentItem.status == status)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{content_id}", response_model=ContentWithResults)
async def get_content_detail(
    content_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get a single content item with its moderation results."""
    result = await db.execute(
        select(ContentItem)
        .options(selectinload(ContentItem.moderation_results), selectinload(ContentItem.author))
        .where(ContentItem.id == content_id)
    )
    content = result.scalar_one_or_none()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    return content


@router.post("/{content_id}/review", response_model=ContentResponse)
async def review_content(
    content_id: uuid.UUID,
    action: ReviewAction,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Admin action: approve, reject, or flag a content item."""
    result = await db.execute(select(ContentItem).where(ContentItem.id == content_id))
    content = result.scalar_one_or_none()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    if action.action not in (ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.FLAGGED):
        raise HTTPException(status_code=400, detail="Invalid action")

    # Save manual category classification
    if action.action == ModerationStatus.REJECTED and action.category:
        manual_result = ModerationResult(
            content_id=content.id,
            category=FlagCategory(action.category),
            confidence=1.0,
            model_name="manual-review",
            details=f"Manually classified by reviewer: {action.reason or ''}".strip(),
        )
        db.add(manual_result)
    elif action.action == ModerationStatus.APPROVED:
        manual_result = ModerationResult(
            content_id=content.id,
            category=FlagCategory.CLEAN,
            confidence=1.0,
            model_name="manual-review",
            details="Approved by reviewer",
        )
        db.add(manual_result)

    # Audit log
    audit = AuditLog(
        content_id=content.id,
        reviewer_id=user.id,
        action=f"manual_{action.action.value}",
        previous_status=content.status,
        new_status=action.action,
        reason=action.reason,
    )
    db.add(audit)

    content.status = action.action
    await db.commit()
    await db.refresh(content)
    return content
