/**
 * Statistics chart-data fetch.
 *
 * The statistics island needs server-computed chart data the bundle cannot
 * derive locally — the per-language term-status counts (intensity) and the
 * created/activity/known totals over rolling time windows (frequency). The
 * server exposes them at `GET /api/v1/activity/statistics`
 * (ActivityApiHandler::statistics), fetched through the api client so a
 * connected remote server authenticates it by bearer token (the old
 * `/profile/statistics/config` cookie route was retired under the headless cut).
 *
 * The page is server-gated (the statistics are computed from the connected
 * server's database), so offline the island is never mounted and this is never
 * called.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { apiGet } from '@shared/api/client';

/** Per-language term-status counts for the intensity (stacked bar) chart. */
export interface IntensityLanguageData {
  name: string;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  s99: number;
}

/** Created / Activity / Known totals over rolling windows for the line chart. */
export interface FrequencyTotals {
  ct: number; at: number; kt: number;
  cy: number; ay: number; ky: number;
  cw: number; aw: number; kw: number;
  cm: number; am: number; km: number;
  ca: number; aa: number; ka: number;
}

/** Bootstrap config the StatisticsPage island receives as props on mount. */
export interface StatisticsConfig {
  intensity: IntensityLanguageData[];
  frequency: FrequencyTotals;
}

/** A zeroed totals object, used as a safe default when the fetch fails. */
export const ZERO_FREQUENCY_TOTALS: FrequencyTotals = {
  ct: 0, at: 0, kt: 0,
  cy: 0, ay: 0, ky: 0,
  cw: 0, aw: 0, kw: 0,
  cm: 0, am: 0, km: 0,
  ca: 0, aa: 0, ka: 0
};

/**
 * Fetch the statistics chart data. Never throws: on any transport/parse failure
 * it returns empty intensity + zeroed totals, so the island still mounts (the
 * streak + calendar sections it fetches itself are unaffected).
 */
export async function fetchStatisticsConfig(): Promise<StatisticsConfig> {
  try {
    const response = await apiGet<StatisticsConfig>('/activity/statistics');
    const data = response.data;
    if (!data) {
      return { intensity: [], frequency: { ...ZERO_FREQUENCY_TOTALS } };
    }
    return {
      intensity: Array.isArray(data.intensity) ? data.intensity : [],
      frequency: data.frequency ?? { ...ZERO_FREQUENCY_TOTALS }
    };
  } catch {
    return { intensity: [], frequency: { ...ZERO_FREQUENCY_TOTALS } };
  }
}
