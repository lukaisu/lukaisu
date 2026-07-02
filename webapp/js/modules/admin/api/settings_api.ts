/**
 * Settings API - Type-safe wrapper for settings operations.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { apiGet, apiPostForm, type ApiResponse } from '@shared/api/client';

/**
 * Response for saving a setting.
 */
export interface SettingSaveResponse {
  message?: string;
  error?: string;
}

/**
 * Response for getting theme path.
 */
export interface ThemePathResponse {
  theme_path: string;
}

/**
 * Server-wide admin settings (feed limits + multi-user flags), keyed by setting
 * name. Values are strings as stored in the settings table.
 */
export type AdminSettings = Record<string, string>;

/**
 * Settings API methods.
 */
export const SettingsApi = {
  /**
   * Save a setting to the database.
   *
   * @param key   Setting name
   * @param value Setting value
   * @returns Promise with save result
   */
  async save(key: string, value: string): Promise<ApiResponse<SettingSaveResponse>> {
    return apiPostForm<SettingSaveResponse>('/settings', { key, value });
  },

  /**
   * Get the file path using the current theme.
   *
   * @param path Relative filepath
   * @returns Promise with theme-resolved path
   */
  async getThemePath(path: string): Promise<ApiResponse<ThemePathResponse>> {
    return apiGet<ThemePathResponse>('/settings/theme-path', { path });
  },

  /**
   * Load the current server-wide admin settings (admin-scoped; 403 for a
   * non-admin in multi-user mode). Backs the bundled admin-settings panel.
   *
   * @returns Promise with the admin settings map
   */
  async getAdminSettings(): Promise<ApiResponse<AdminSettings>> {
    return apiGet<AdminSettings>('/settings/admin');
  }
};
