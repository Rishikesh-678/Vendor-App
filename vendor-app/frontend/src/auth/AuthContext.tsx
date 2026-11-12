import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, use, type ReactNode } from "react";

import { ApiError, api } from "../api/client";
import type { User } from "../api/types";

export const ME_KEY = ["auth", "me"] as const;

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchMe(): Promise<User | null> {
  try {
    return await api<User>("/auth/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: Infinity });

  const loginMut = useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      api<User>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (user) => qc.setQueryData(ME_KEY, user),
  });

  const logoutMut = useMutation({
    mutationFn: () => api<void>("/auth/logout", { method: "POST" }),
    onSettled: () => {
      qc.setQueryData(ME_KEY, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
    },
  });

  const value: AuthState = {
    user: me.data ?? null,
    isLoading: me.isPending,
    login: (username, password) => loginMut.mutateAsync({ username, password }),
    logout: () => logoutMut.mutateAsync(),
  };
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
