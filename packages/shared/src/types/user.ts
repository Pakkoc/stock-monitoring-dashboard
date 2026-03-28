/**
 * User/Auth domain types — shared between frontend and backend
 */

/** User roles */
export type Role = 'USER' | 'ADMIN';

/** User entity */
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  surgeThreshold: number; // Percentage threshold for surge alerts (default: 5.0)
  settingsJson: UserSettings | null;
  createdAt: Date;
  updatedAt: Date;
}

/** User settings stored as JSON */
export interface UserSettings {
  dashboardLayout?: Record<string, unknown>;
  notificationPreferences?: {
    surgeAlerts: boolean;
    newsAlerts: boolean;
    emailNotifications: boolean;
  };
  watchlistOrder?: string[];
}

/** Session info for frontend */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}
