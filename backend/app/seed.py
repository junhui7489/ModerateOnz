"""
Seed the database with demo data for development.

Run:  python -m app.seed
"""

import asyncio
import random
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.database import async_session, init_db
from app.models import (
    User,
    ContentItem,
    ModerationResult,
    ContentType,
    ModerationStatus,
    FlagCategory,
)
from app.services.auth import hash_password

DEMO_TEXTS = {
    FlagCategory.TOXICITY: [
        "You're so stupid, nobody wants you here at all",
        "What a completely useless idiot you are lmao",
        "Get lost loser, everyone hates you already",
        "You're the worst person I've ever encountered online",
    ],
    FlagCategory.SPAM: [
        "Buy followers now! 100% real, DM for prices and discounts",
        "FREE GIFT CARDS click here now limited time only!!!",
        "Make $5000 per week from home, send me a DM for details",
        "Check out my link in bio for amazing deals today",
    ],
    FlagCategory.NSFW: [
        "Profile image upload — flagged by image classifier",
        "User avatar change — flagged as potentially inappropriate",
        "Uploaded media — detected explicit content in image",
    ],
    FlagCategory.VIOLENCE: [
        "Comment image — mild violence detected in shared meme",
        "Uploaded content contains graphic imagery",
        "Post flagged for violent language and threats",
    ],
    FlagCategory.HATE_SPEECH: [
        "Discriminatory comment targeting ethnic group",
        "Hateful rhetoric aimed at religious community",
    ],
    FlagCategory.CLEAN: [
        "Great article, thanks for sharing this helpful resource!",
        "I really enjoyed reading this post, very informative",
        "Thanks for the update, looking forward to more content",
        "This is exactly what I was looking for, thank you",
        "Wonderful community, happy to be part of it",
        "Can anyone recommend a good tutorial on this topic?",
        "Just finished reading — really well written piece",
        "Appreciate the detailed breakdown of the topic here",
    ],
}

STATUS_BY_CATEGORY = {
    FlagCategory.TOXICITY: ModerationStatus.FLAGGED,
    FlagCategory.SPAM: ModerationStatus.FLAGGED,
    FlagCategory.NSFW: ModerationStatus.IN_REVIEW,
    FlagCategory.VIOLENCE: ModerationStatus.IN_REVIEW,
    FlagCategory.HATE_SPEECH: ModerationStatus.FLAGGED,
    FlagCategory.CLEAN: ModerationStatus.APPROVED,
}

MODEL_NAMES = {
    FlagCategory.TOXICITY: "toxic-bert",
    FlagCategory.SPAM: "spam-heuristic-v1",
    FlagCategory.NSFW: "nsfw-image-detector",
    FlagCategory.VIOLENCE: "nsfw-image-detector",
    FlagCategory.HATE_SPEECH: "toxic-bert",
    FlagCategory.CLEAN: "toxic-bert",
}


async def seed():
    await init_db()

    async with async_session() as db:
        # ── Create demo users ────────────────────
        admin = User(
            id=uuid4(),
            email="admin@demo.com",
            username="admin",
            hashed_password=hash_password("admin123"),
            is_admin=True,
        )
        users = [admin]
        for i in range(20):
            users.append(
                User(
                    id=uuid4(),
                    email=f"user{i}@demo.com",
                    username=f"user_{1000 + i}",
                    hashed_password=hash_password("password"),
                )
            )
        db.add_all(users)
        await db.flush()

        # ── Create content items over the last 7 days ──
        now = datetime.now(timezone.utc)
        content_items = []

        # Weighted distribution: mostly clean, some flagged
        distribution = (
            [(FlagCategory.CLEAN, 0.72)]
            + [(FlagCategory.TOXICITY, 0.10)]
            + [(FlagCategory.SPAM, 0.07)]
            + [(FlagCategory.NSFW, 0.05)]
            + [(FlagCategory.VIOLENCE, 0.04)]
            + [(FlagCategory.HATE_SPEECH, 0.02)]
        )

        for day_offset in range(7):
            day_base = now - timedelta(days=6 - day_offset)
            daily_count = random.randint(140, 200)

            for _ in range(daily_count):
                # Pick category by weight
                r = random.random()
                cumulative = 0.0
                chosen_cat = FlagCategory.CLEAN
                for cat, weight in distribution:
                    cumulative += weight
                    if r <= cumulative:
                        chosen_cat = cat
                        break

                texts = DEMO_TEXTS[chosen_cat]
                text = random.choice(texts)
                is_image = chosen_cat in (FlagCategory.NSFW, FlagCategory.VIOLENCE) and random.random() < 0.6

                created_at = day_base + timedelta(
                    hours=random.randint(0, 23),
                    minutes=random.randint(0, 59),
                    seconds=random.randint(0, 59),
                )

                # Some pending items for today
                if day_offset == 6 and random.random() < 0.15:
                    status = random.choice([ModerationStatus.PENDING, ModerationStatus.IN_REVIEW])
                else:
                    status = STATUS_BY_CATEGORY[chosen_cat]

                content = ContentItem(
                    id=uuid4(),
                    author_id=random.choice(users[1:]).id,
                    content_type=ContentType.IMAGE if is_image else ContentType.TEXT,
                    text_content=text if not is_image else None,
                    media_url="/app/uploads/placeholder.jpg" if is_image else None,
                    status=status,
                    created_at=created_at,
                    updated_at=created_at + timedelta(seconds=random.randint(5, 120)),
                )
                content_items.append((content, chosen_cat))

        db.add_all([c for c, _ in content_items])
        await db.flush()

        # ── Create moderation results ────────────
        mod_results = []
        for content, category in content_items:
            if category == FlagCategory.CLEAN:
                confidence = round(random.uniform(0.90, 0.99), 4)
            else:
                confidence = round(random.uniform(0.60, 0.98), 4)

            mod_results.append(
                ModerationResult(
                    id=uuid4(),
                    content_id=content.id,
                    category=category,
                    confidence=confidence,
                    model_name=MODEL_NAMES[category],
                    details=f"Auto-classified as {category.value}",
                    created_at=content.created_at + timedelta(seconds=random.randint(2, 30)),
                )
            )

        db.add_all(mod_results)
        await db.commit()

        total = len(content_items)
        flagged = sum(1 for _, c in content_items if c != FlagCategory.CLEAN)
        print(f"Seeded {len(users)} users, {total} content items ({flagged} flagged), {len(mod_results)} moderation results")
        print(f"Admin login:  admin@demo.com / admin123")


if __name__ == "__main__":
    asyncio.run(seed())
