/**
 * Auth store — manages user authentication state.
 *
 * Uses Zustand with localStorage persistence for token management.
 * Provides login/logout actions and computed isAuthenticated state.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SessionUser } from '@stock-dashboard/shared';

interface AuthState {
  /** Currently logged-in user info (null if not authenticated) */
  user: SessionUser | null;
  /** Auth token stored in localStorage */
  token: string | null;

  /** Whether the user is authenticated */
  isAuthenticated: () => boolean;
  /** Whether the user has admin role */
  isAdmin: () => boolean;

  /** Set the authenticated user and token after login */
  login: (user: SessionUser, token: string) => void;
  /** Clear auth state on logout */
  logout: () => void;
  /** Update user info (e.g., after profile edit) */
  updateUser: (updates: Partial<SessionUser>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,

      isAuthenticated: () => {
        const state = get();
        return state.user !== null && state.token !== null;
      },

      isAdmin: () => {
        const state = get();
        return state.user?.role === 'ADMIN';
      },

      login: (user, token) => {
        set({ user, token });
        // Also store token separately for socket auth
        try {
          localStorage.setItem('auth-token', token);
        } catch {
          // Ignore localStorage errors
        }
      },

      logout: () => {
        set({ user: null, token: null });
        try {
          localStorage.removeItem('auth-token');
        } catch {
          // Ignore localStorage errors
        }
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    {
      name: 'smd-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
      }),
    },
  ),
);
