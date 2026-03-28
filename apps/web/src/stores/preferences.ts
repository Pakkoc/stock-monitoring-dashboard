/**
 * User preferences store — manages user settings.
 *
 * Uses Zustand with localStorage persistence.
 * Full implementation in Step 17 (Frontend Shell).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreferencesState {
  /** Surge threshold percentage (Korean stock market default: 5%) */
  surgeThreshold: number;
  /** Whether to show surge alert notifications */
  surgeAlertsEnabled: boolean;
  /** Whether to show news update notifications */
  newsAlertsEnabled: boolean;
  /** Dark mode preference */
  darkMode: boolean;
  /** Set surge threshold */
  setSurgeThreshold: (threshold: number) => void;
  /** Toggle surge alerts */
  toggleSurgeAlerts: () => void;
  /** Toggle news alerts */
  toggleNewsAlerts: () => void;
  /** Toggle dark mode */
  toggleDarkMode: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      surgeThreshold: 5.0,
      surgeAlertsEnabled: true,
      newsAlertsEnabled: true,
      darkMode: false,
      setSurgeThreshold: (threshold) => set({ surgeThreshold: threshold }),
      toggleSurgeAlerts: () =>
        set((state) => ({ surgeAlertsEnabled: !state.surgeAlertsEnabled })),
      toggleNewsAlerts: () =>
        set((state) => ({ newsAlertsEnabled: !state.newsAlertsEnabled })),
      toggleDarkMode: () =>
        set((state) => ({ darkMode: !state.darkMode })),
    }),
    {
      name: 'user-preferences',
    },
  ),
);
