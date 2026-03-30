import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authApi, contentApi, dashboardApi } from "@/lib/api";
import type {
  LoginRequest,
  RegisterRequest,
  ModerationStatus,
  ReviewAction,
} from "@/types";

// ── Auth hooks ───────────────────────────────────────

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: authApi.getProfile,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: LoginRequest) => {
      const token = await authApi.login(data);
      localStorage.setItem("token", token.access_token);
      return token;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (data: RegisterRequest) => authApi.register(data),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return () => {
    localStorage.removeItem("token");
    queryClient.clear();
    window.location.href = "/login";
  };
}

// ── Content hooks ────────────────────────────────────

export function useQueue(status?: ModerationStatus, limit = 20, offset = 0) {
  return useQuery({
    queryKey: ["queue", status, limit, offset],
    queryFn: () => contentApi.getQueue({ status, limit, offset }),
    refetchInterval: 10000, // poll every 10s for live updates
  });
}

export function useContentDetail(id: string) {
  return useQuery({
    queryKey: ["content", id],
    queryFn: () => contentApi.getDetail(id),
    enabled: !!id,
  });
}

export function useSubmitContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => contentApi.submit(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useReviewContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ReviewAction }) =>
      contentApi.review(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ── Dashboard hooks ──────────────────────────────────

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: dashboardApi.getData,
    refetchInterval: 30000, // refresh every 30s
  });
}
