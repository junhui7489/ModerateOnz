from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from uuid import UUID
from app.models import ContentType, ModerationStatus, FlagCategory


# ── Auth ──────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    username: str
    password: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    username: str
    is_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: str
    password: str


# ── Content ───────────────────────────────────────────

class ContentSubmit(BaseModel):
    text_content: str | None = None
    content_type: ContentType = ContentType.TEXT


class ContentResponse(BaseModel):
    id: UUID
    author_id: UUID
    content_type: ContentType
    text_content: str | None
    media_url: str | None
    status: ModerationStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ContentWithResults(ContentResponse):
    moderation_results: list["ModerationResultResponse"] = []
    author: UserResponse | None = None


# ── Moderation ────────────────────────────────────────

class ModerationResultResponse(BaseModel):
    id: UUID
    content_id: UUID
    category: FlagCategory
    confidence: float
    model_name: str
    details: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class ReviewAction(BaseModel):
    action: ModerationStatus
    reason: str | None = None


# ── Dashboard / Analytics ─────────────────────────────

class DashboardMetrics(BaseModel):
    total_reviewed: int
    flagged_count: int
    auto_approved: int
    pending_count: int
    flag_rate: float
    approval_rate: float
    avg_wait_hours: float


class CategoryBreakdown(BaseModel):
    category: str
    count: int
    percentage: float


class DailyVolume(BaseModel):
    date: str
    approved: int
    flagged: int


class DashboardResponse(BaseModel):
    metrics: DashboardMetrics
    categories: list[CategoryBreakdown]
    daily_volume: list[DailyVolume]
