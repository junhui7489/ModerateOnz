from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, cast, Date

from app.database import get_db
from app.models import ContentItem, ModerationResult, ModerationStatus, FlagCategory, User
from app.schemas import DashboardResponse, DashboardMetrics, CategoryBreakdown, DailyVolume
from app.services.auth import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/", response_model=DashboardResponse)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Aggregate metrics, category breakdown, and daily volume for the dashboard."""

    # ── Summary metrics ──────────────────────
    total = await db.scalar(
        select(func.count()).select_from(ContentItem).where(
            ContentItem.status != ModerationStatus.PENDING
        )
    ) or 0

    flagged = await db.scalar(
        select(func.count()).select_from(ContentItem).where(
            ContentItem.status.in_([ModerationStatus.FLAGGED, ModerationStatus.REJECTED])
        )
    ) or 0

    approved = await db.scalar(
        select(func.count()).select_from(ContentItem).where(
            ContentItem.status == ModerationStatus.APPROVED
        )
    ) or 0

    pending = await db.scalar(
        select(func.count()).select_from(ContentItem).where(
            ContentItem.status.in_([ModerationStatus.PENDING, ModerationStatus.IN_REVIEW])
        )
    ) or 0

    # Average wait time for pending items
    avg_wait_result = await db.scalar(
        select(
            func.avg(func.extract("epoch", func.now() - ContentItem.created_at) / 3600)
        ).where(
            ContentItem.status.in_([ModerationStatus.PENDING, ModerationStatus.IN_REVIEW])
        )
    )
    avg_wait_hours = round(avg_wait_result or 0.0, 1)

    metrics = DashboardMetrics(
        total_reviewed=total,
        flagged_count=flagged,
        auto_approved=approved,
        pending_count=pending,
        flag_rate=round((flagged / total * 100) if total > 0 else 0, 1),
        approval_rate=round((approved / total * 100) if total > 0 else 0, 1),
        avg_wait_hours=avg_wait_hours,
    )

    # ── Category breakdown ───────────────────
    cat_query = (
        select(ModerationResult.category, func.count().label("count"))
        .where(ModerationResult.category != FlagCategory.CLEAN)
        .group_by(ModerationResult.category)
        .order_by(func.count().desc())
    )
    cat_result = await db.execute(cat_query)
    cat_rows = cat_result.all()

    total_flags = sum(r.count for r in cat_rows) or 1
    categories = [
        CategoryBreakdown(
            category=r.category.value,
            count=r.count,
            percentage=round(r.count / total_flags * 100, 1),
        )
        for r in cat_rows
    ]

    # ── Daily volume (last 7 days) ───────────
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    daily_query = (
        select(
            cast(ContentItem.created_at, Date).label("date"),
            func.count().filter(
                ContentItem.status == ModerationStatus.APPROVED
            ).label("approved"),
            func.count().filter(
                ContentItem.status.in_([ModerationStatus.FLAGGED, ModerationStatus.REJECTED])
            ).label("flagged"),
        )
        .where(ContentItem.created_at >= seven_days_ago)
        .group_by(cast(ContentItem.created_at, Date))
        .order_by(cast(ContentItem.created_at, Date))
    )
    daily_result = await db.execute(daily_query)
    daily_rows = daily_result.all()

    daily_volume = [
        DailyVolume(
            date=str(r.date),
            approved=r.approved or 0,
            flagged=r.flagged or 0,
        )
        for r in daily_rows
    ]

    return DashboardResponse(
        metrics=metrics,
        categories=categories,
        daily_volume=daily_volume,
    )
