# ModerateOnz

A full-stack AI-powered content moderation platform that crawls real YouTube comments, classifies them in real-time using ML models, surfaces results in an admin dashboard with analytics, and supports human-in-the-loop review workflows.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  React + TypeScript Frontend (Vercel)               │
│  Dashboard · Review Queue · Detail Modal · Auth     │
└──────────────────────┬──────────────────────────────┘
                       │ REST API (HTTPS)
┌──────────────────────▼──────────────────────────────┐
│  FastAPI Backend (Railway)                           │
│  Auth (JWT) · Content CRUD · Dashboard Analytics     │
└─────┬──────────────────────────────────┬────────────┘
      │ Enqueue                          │ Read/Write
┌─────▼─────────┐              ┌────────▼────────────┐
│ Celery + Redis│              │   PostgreSQL         │
│ (Railway)     │              │   (Railway Plugin)   │
└─────┬─────────┘              └─────────────────────┘
      │ Dispatch
┌─────▼──────────────────────────────────────────────┐
│  ML Classifiers (Celery Worker — Railway)           │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐│
│  │ toxic-bert   │ │ nsfw-detect  │ │ sentiment   ││
│  │ (text)       │ │ (image)      │ │ (distilbert)││
│  └──────────────┘ └──────────────┘ └─────────────┘│
│  + Spam heuristic engine                           │
└────────────────────────────────────────────────────┘
      ▲ Crawl
┌─────┴──────────────────────────────────────────────┐
│  YouTube Crawler (Celery Beat — scheduled)          │
│  Searches videos by query · Fetches comments        │
│  Stores commenter name, video ID, timestamp         │
└────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer       | Technology                                         |
| ----------- | -------------------------------------------------- |
| Frontend    | React 18, TypeScript, Vite, Tailwind CSS, Recharts |
| Hosting     | Vercel (frontend), Railway (backend + infra)       |
| State       | TanStack React Query (server state + polling)      |
| Backend API | FastAPI, Pydantic, SQLAlchemy 2.0 (async)          |
| Auth        | JWT (python-jose), bcrypt                          |
| Queue       | Celery 5 + Redis                                   |
| ML Models   | HuggingFace Transformers                           |
| Crawler     | YouTube Data API v3 (google-api-python-client)     |
| Database    | PostgreSQL 16                                      |

---

## Quick Start (Local Development)

### Prerequisites

- Docker and Docker Compose
- (Optional) Node.js 20+ and Python 3.11+ for running without Docker
- YouTube Data API v3 key (for crawling real data)

### 1. Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/content-moderation-dashboard.git
cd content-moderation-dashboard
```

### 2. Create `.env` file

```env
DATABASE_URL=postgresql+asyncpg://moderation:moderation_secret@db:5432/moderation_db
REDIS_URL=redis://redis:6379/0
SECRET_KEY=local-dev-secret-key-change-in-production
FRONTEND_URL=http://localhost:5173

# YouTube Data API v3 — https://console.cloud.google.com/apis/credentials
YOUTUBE_API_KEY=your-api-key-here
YOUTUBE_VIDEO_IDS=
YOUTUBE_SEARCH_QUERIES=content moderation,online safety
YOUTUBE_MAX_COMMENTS=50

# Crawler schedule
CRAWLER_INTERVAL_MINUTES=30
```

### 3. Start with Docker Compose

```bash
docker compose up --build
```

This starts 6 services: PostgreSQL, Redis, FastAPI backend, Celery worker, Celery Beat scheduler, and the React frontend.

### 4. Seed demo data (optional)

```bash
docker compose exec backend python -m app.seed
```

### 5. Crawl real YouTube data

```bash
docker compose exec worker python -m app.crawler
```

The Celery Beat scheduler also runs the crawler automatically every 30 minutes (configurable via `CRAWLER_INTERVAL_MINUTES`).

### 6. Open the dashboard

Visit **http://localhost:5173** and sign in:

```
Email:    admin@demo.com
Password: admin123
```

---

## YouTube Crawler

The crawler fetches real comments from YouTube videos for moderation analysis.

### How it works

1. **Search** — Finds recent videos matching configured search queries via the YouTube Data API
2. **Crawl** — Fetches top-level comments from each video, extracting comment text, commenter name, video ID, and timestamp
3. **Deduplicate** — Tracks source IDs to avoid re-crawling the same comment
4. **Enqueue** — Creates `ContentItem` rows with status `PENDING` and dispatches moderation tasks to the Celery worker
5. **Moderate** — The worker runs ML classifiers (toxicity, sentiment, spam, NSFW) and updates the status

### Configuration

| Env Variable              | Description                                      | Default          |
| ------------------------- | ------------------------------------------------ | ---------------- |
| `YOUTUBE_API_KEY`         | Google API key with YouTube Data API v3 enabled   | (required)       |
| `YOUTUBE_VIDEO_IDS`       | Comma-separated video IDs to crawl directly       | (empty)          |
| `YOUTUBE_SEARCH_QUERIES`  | Comma-separated search terms to find videos       | (empty)          |
| `YOUTUBE_MAX_COMMENTS`    | Max comments to fetch per video                   | 50               |
| `CRAWLER_INTERVAL_MINUTES`| How often the crawler runs via Celery Beat        | 30               |

### Manual crawl

```bash
docker compose exec worker python -m app.crawler
```

### Manual crawl via API

Admins can trigger a crawl immediately via the API instead of waiting for the Celery Beat schedule:

```
POST /api/crawl/trigger
Authorization: Bearer <admin-token>
```

### Retry pending moderation

If items are stuck in "Pending" status (e.g. due to worker downtime), admins can re-queue them all:

```
POST /api/moderate/retry-pending
Authorization: Bearer <admin-token>
```

---

## ML Classification Pipeline

Content is classified by multiple models running in the Celery worker:

| Model                  | Type       | Purpose                              |
| ---------------------- | ---------- | ------------------------------------ |
| `toxic-bert`           | Text       | Toxicity, insults, threats, hate speech detection |
| `distilbert-sentiment` | Text       | Sentiment analysis (informational only, does not flag) |
| `spam-heuristic-v1`    | Text       | Rule-based spam detection (URL density, caps, keywords) |
| `nsfw-image-detector`  | Image      | NSFW / unsafe image classification   |

### Classification logic

- Source metadata tags (e.g. `[youtube:...]`) are stripped before classification to avoid polluting model input
- **Toxicity threshold**: 0.75 — only flags when a specifically toxic label (toxic, severe_toxic, insult, threat, identity_hate, obscene) exceeds this threshold
- **Sentiment model** is informational only and does not contribute to flagging decisions (negative sentiment is not the same as toxicity)
- **Auto-approve**: Content with all toxic scores below 0.15 is automatically approved
- **Flagged**: High-confidence toxic content (>= 0.85) is auto-flagged
- **In review**: Moderate-confidence toxic content (0.75–0.85) is routed to human reviewers
- **Model preloading**: ML models are loaded when the Celery worker starts (via `worker_ready` signal), eliminating the ~20s delay on the first moderation task

---

## Review Queue & Detail Modal

The review queue displays all crawled content with filterable status tabs (All, Pending, In Review, Flagged, Approved, Rejected).

### Queue table

- Shows **category** and **confidence %** for all items (including clean results)
- Displays the **YouTube commenter name** (extracted from source metadata, not the internal crawler user)
- **Approve** — instantly approves the item and creates a "clean" moderation result (100% confidence)
- **Reject** — opens a modal where the reviewer must select a category (Toxicity, NSFW, Spam, Violence, Hate Speech) and can optionally provide a reason. The classification is saved as a manual moderation result so it appears in the dashboard analytics

### Clicking a row opens a detail modal showing:

- **Full comment text** (untruncated)
- **YouTube commenter name** (extracted from source metadata)
- **Timestamp** of the original comment
- **Link to source video** (clickable, opens YouTube)
- **Moderation results** — each model's category and confidence score
- **Current status** with Approve/Reject actions

---

## Security

- The `.env` file is **never baked into Docker images** — environment variables are injected at runtime via `docker-compose.yml` variable interpolation
- `.dockerignore` files in both `backend/` and `frontend/` exclude `.env` from `COPY` commands
- API keys and secrets stay on the host machine only

---

## Production Deployment

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/content-moderation-dashboard.git
git push -u origin main
```

### Step 2 — Deploy Backend to Railway

1. Go to railway.app → New Project → Deploy from GitHub Repo
2. Select your repository

3. Add infrastructure plugins (click "+ New" on the project canvas):
   - PostgreSQL — Railway auto-creates DATABASE_URL
   - Redis — Railway auto-creates REDIS_URL

4. Create the API service:
   - Source: your GitHub repo
   - Root directory: backend
   - Railway auto-detects Dockerfile
   - Add these environment variables:
     - FRONTEND_URL=https://your-app.vercel.app
     - SECRET_KEY=<generate-a-random-64-char-string>
     - YOUTUBE_API_KEY=<your-youtube-api-key>
     - YOUTUBE_SEARCH_QUERIES=content moderation,online safety
   - DATABASE_URL and REDIS_URL are auto-injected from the plugins

5. Create the Worker service:
   - Click "+ New" → GitHub Repo (same repo)
   - Root directory: backend
   - Override Dockerfile path: Dockerfile.worker
   - Same shared environment variables from plugins

6. Create the Beat service (crawler scheduler):
   - Click "+ New" → GitHub Repo (same repo)
   - Root directory: backend
   - Start command: `celery -A app.worker.celery_app beat --loglevel=info`
   - Same shared environment variables from plugins

7. Generate a public domain for the API service:
   - Go to API service → Settings → Networking → Generate Domain
   - Copy the URL (e.g., https://content-mod-api-production.up.railway.app)

8. Seed the database:
   ```bash
   npm install -g @railway/cli
   railway login
   railway link
   railway run --service api python -m app.seed
   ```

### Step 3 — Deploy Frontend to Vercel

1. Go to vercel.com → Add New Project → Import Git Repository
2. Select your repository
3. Configure:
   - Root directory: frontend
   - Framework preset: Vite (auto-detected)
4. Add environment variable:
   - VITE_API_URL = https://content-mod-api-production.up.railway.app
5. Click Deploy

6. Update Railway CORS — go back to Railway and update the API service env:
   - FRONTEND_URL=https://your-app.vercel.app

Every push to main auto-deploys both Vercel and Railway.

---

## API Endpoints

### Auth
| Method | Endpoint           | Description          |
| ------ | ------------------ | -------------------- |
| POST   | /api/auth/register | Create account       |
| POST   | /api/auth/login    | Get JWT token        |
| GET    | /api/auth/me       | Current user profile |

### Content
| Method | Endpoint                     | Description                      |
| ------ | ---------------------------- | -------------------------------- |
| POST   | /api/content/submit          | Submit text/image for moderation |
| GET    | /api/content/queue           | List content (filterable)        |
| GET    | /api/content/{id}            | Detail with moderation results   |
| POST   | /api/content/{id}/review     | Admin approve/reject (with category on reject) |

### Crawl & Moderation
| Method | Endpoint                 | Description                          |
| ------ | ------------------------ | ------------------------------------ |
| POST   | /api/crawl/trigger       | Manually trigger YouTube crawl       |
| POST   | /api/moderate/retry-pending | Re-queue all pending items for moderation |

### Dashboard
| Method | Endpoint        | Description                       |
| ------ | --------------- | --------------------------------- |
| GET    | /api/dashboard/ | Metrics, categories, daily volume |

---

## Project Structure

```
content-moderation-dashboard/
├── .gitignore
├── .env                         # Local env vars (not committed)
├── docker-compose.yml           # 6 services with env var interpolation
├── backend/
│   ├── .dockerignore            # Excludes .env from Docker image
│   ├── Dockerfile               # API (gunicorn + uvicorn)
│   ├── Dockerfile.worker        # Celery worker
│   ├── requirements.txt
│   └── app/
│       ├── main.py              # FastAPI app
│       ├── config.py            # Settings (DB, Redis, YouTube API, crawler)
│       ├── database.py          # Async SQLAlchemy
│       ├── schemas.py           # Pydantic models
│       ├── worker.py            # Celery tasks + Beat schedule
│       ├── crawler.py           # YouTube comments crawler
│       ├── seed.py              # Demo data seeder
│       ├── models/__init__.py   # ORM models
│       ├── routers/
│       │   ├── auth.py
│       │   ├── content.py
│       │   └── dashboard.py
│       └── services/
│           ├── auth.py          # JWT + bcrypt
│           └── classifiers.py   # ML model wrappers (toxicity, sentiment, spam, NSFW)
└── frontend/
    ├── .dockerignore            # Excludes .env from Docker image
    ├── vercel.json              # SPA rewrites + caching
    ├── .env.example
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── types/index.ts
        ├── lib/api.ts           # Axios (reads VITE_API_URL)
        ├── hooks/useApi.ts      # React Query hooks
        └── components/
            ├── Layout.tsx
            ├── MetricCard.tsx
            ├── StatusBadge.tsx
            ├── CategoryChart.tsx
            ├── VolumeChart.tsx
            ├── QueueTable.tsx           # Clickable rows, commenter names
            ├── ContentDetailModal.tsx   # Full comment detail + review actions
            ├── SubmitForm.tsx
            └── pages/
                ├── DashboardPage.tsx
                ├── QueuePage.tsx
                ├── SubmitPage.tsx
                └── LoginPage.tsx
```

---

## License

MIT
