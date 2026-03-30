from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import get_settings
from app.database import init_db, async_session
from app.models import User
from app.routers import auth_router, content_router, dashboard_router
from app.services.auth import hash_password, require_admin

settings = get_settings()


async def _ensure_admin():
    """Create the default admin user if no users exist yet."""
    async with async_session() as db:
        result = await db.execute(select(User).limit(1))
        if result.scalar_one_or_none() is None:
            db.add(User(
                id=uuid4(),
                email="admin@demo.com",
                username="admin",
                hashed_password=hash_password("admin123"),
                is_admin=True,
            ))
            await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _ensure_admin()
    yield


app = FastAPI(
    title="Content Moderation Dashboard API",
    description="Multimodal AI-powered content moderation platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(content_router)
app.include_router(dashboard_router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "content-moderation-api"}


@app.post("/api/crawl/trigger")
async def trigger_crawl(_user: User = Depends(require_admin)):
    """Manually trigger a crawl (admin only). Runs synchronously for debugging."""
    from app.crawler import run_all_crawlers
    try:
        results = run_all_crawlers()
        return {"status": "ok", "results": results}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
