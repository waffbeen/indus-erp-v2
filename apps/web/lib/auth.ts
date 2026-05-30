import { create } from "zustand";
import type { Me } from "@indus/shared";
import { api, clearTokens, setTokens } from "./api";

interface AuthState {
  me: Me | null;
  loading: boolean;
  hydrated: boolean;
  setMe: (me: Me | null) => void;
  hydrate: () => Promise<void>;
  login: (input: { email: string; password: string; keepSignedIn?: boolean }) => Promise<void>;
  register: (input: { fullName: string; email: string; password: string; organizationName: string }) => Promise<Me>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  me: null,
  loading: false,
  hydrated: false,

  setMe: (me) => set({ me }),

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const me = await api<Me>("/api/auth/me");
      set({ me, hydrated: true });
    } catch {
      set({ me: null, hydrated: true });
    }
  },

  login: async ({ email, password, keepSignedIn }) => {
    set({ loading: true });
    try {
      const result = await api<{ accessToken: string; refreshToken: string; me: Me }>(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password, keepSignedIn }),
        },
      );
      setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      set({ me: result.me, hydrated: true });
    } finally {
      set({ loading: false });
    }
  },

  register: async (input) => {
    set({ loading: true });
    try {
      const result = await api<{ accessToken: string; refreshToken: string; me: Me }>(
        "/api/auth/register",
        { method: "POST", body: JSON.stringify(input) },
      );
      setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      set({ me: result.me, hydrated: true });
      return result.me;
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    try {
      const refreshToken = typeof window !== "undefined"
        ? window.localStorage.getItem("indus.refresh")
        : null;
      await api("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      /* ignore */
    }
    clearTokens();
    set({ me: null });
  },
}));
