import axios from "axios";
import type {
  Token,
  LoginRequest,
  RegisterRequest,
  User,
  ContentWithResults,
  DashboardData,
  ModerationStatus,
  ReviewAction,
  ContentItem,
} from "@/types";

// In production (Vercel), VITE_API_URL points to the Railway backend.
// In local dev, Vite proxies /api to localhost:8000 so this stays empty.
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────

export const authApi = {
  login: async (data: LoginRequest): Promise<Token> => {
    const res = await api.post<Token>("/auth/login", data);
    return res.data;
  },

  register: async (data: RegisterRequest): Promise<User> => {
    const res = await api.post<User>("/auth/register", data);
    return res.data;
  },

  getProfile: async (): Promise<User> => {
    const res = await api.get<User>("/auth/me");
    return res.data;
  },
};

// ── Content ──────────────────────────────────────────

export const contentApi = {
  submit: async (formData: FormData): Promise<ContentItem> => {
    const res = await api.post<ContentItem>("/content/submit", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  getQueue: async (params: {
    status?: ModerationStatus;
    limit?: number;
    offset?: number;
  }): Promise<ContentWithResults[]> => {
    const res = await api.get<ContentWithResults[]>("/content/queue", {
      params,
    });
    return res.data;
  },

  getDetail: async (id: string): Promise<ContentWithResults> => {
    const res = await api.get<ContentWithResults>(`/content/${id}`);
    return res.data;
  },

  review: async (id: string, action: ReviewAction): Promise<ContentItem> => {
    const res = await api.post<ContentItem>(`/content/${id}/review`, action);
    return res.data;
  },
};

// ── Dashboard ────────────────────────────────────────

export const dashboardApi = {
  getData: async (): Promise<DashboardData> => {
    const res = await api.get<DashboardData>("/dashboard/");
    return res.data;
  },
};

export default api;
