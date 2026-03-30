// ── Enums ────────────────────────────────────────────

export type ContentType = "text" | "image" | "mixed";

export type ModerationStatus =
  | "pending"
  | "approved"
  | "flagged"
  | "in_review"
  | "rejected";

export type FlagCategory =
  | "toxicity"
  | "nsfw"
  | "spam"
  | "violence"
  | "hate_speech"
  | "clean";

// ── Auth ─────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

// ── Content ──────────────────────────────────────────

export interface ContentItem {
  id: string;
  author_id: string;
  content_type: ContentType;
  text_content: string | null;
  media_url: string | null;
  status: ModerationStatus;
  created_at: string;
  updated_at: string;
}

export interface ModerationResult {
  id: string;
  content_id: string;
  category: FlagCategory;
  confidence: number;
  model_name: string;
  details: string | null;
  created_at: string;
}

export interface ContentWithResults extends ContentItem {
  moderation_results: ModerationResult[];
  author: User | null;
}

export interface ReviewAction {
  action: ModerationStatus;
  reason?: string;
}

// ── Dashboard ────────────────────────────────────────

export interface DashboardMetrics {
  total_reviewed: number;
  flagged_count: number;
  auto_approved: number;
  pending_count: number;
  flag_rate: number;
  approval_rate: number;
  avg_wait_hours: number;
}

export interface CategoryBreakdown {
  category: string;
  count: number;
  percentage: number;
}

export interface DailyVolume {
  date: string;
  approved: number;
  flagged: number;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  categories: CategoryBreakdown[];
  daily_volume: DailyVolume[];
}
