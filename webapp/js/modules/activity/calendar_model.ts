/**
 * Calendar-heatmap model builder — a GitHub-style contribution grid for the
 * last ~12 months.
 *
 * Pure (framework-agnostic) port of the geometry the Alpine `calendarHeatmap`
 * component built via `createElementNS`: it turns the raw per-day activity map
 * from `/api/v1/activity/calendar` into positioned cells + month labels, which
 * `StatisticsPage.svelte` renders declaratively as SVG. Kept out of the
 * component so its transient `Date`/`Set` usage (one-shot layout maths, not
 * reactive state) needs no `SvelteDate`/`SvelteSet`. The visual output is
 * byte-identical to the Alpine version — same cell size, palette and axes.
 *
 * @license Unlicense <http://unlicense.org/>
 */

/** Cell size and gap for the grid. */
export const CELL_SIZE = 11;
const CELL_GAP = 2;
const CELL_STEP = CELL_SIZE + CELL_GAP;
/** Left padding for day-of-week labels; top padding for month labels. */
const LEFT_PAD = 30;
const TOP_PAD = 16;
/** Colour scale: 0 = empty, 1-4 = increasing intensity. */
const COLORS = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
/** Short month labels for the top axis. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Short day-of-week labels for the left axis (only odd rows are shown). */
export const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

/** Activity counts for a single day. */
export interface DayActivity {
  total: number;
  created: number;
  reviewed: number;
  read: number;
}

/** Raw per-day activity map keyed by `YYYY-MM-DD` (from the calendar endpoint). */
export type HeatmapData = Record<string, DayActivity>;

/** A positioned, coloured cell with a prebuilt tooltip label. */
export interface CalendarCell {
  date: string;
  total: number;
  x: number;
  y: number;
  fill: string;
  label: string;
}

/** A month label positioned along the top axis. */
export interface MonthLabel {
  x: number;
  text: string;
}

/** The full SVG model: cells, month labels and the overall viewBox size. */
export interface CalendarModel {
  cells: CalendarCell[];
  monthLabels: MonthLabel[];
  width: number;
  height: number;
}

/** Map a raw activity count to a colour index (0-4). */
function colorLevel(value: number, max: number): number {
  if (value === 0) return 0;
  if (max <= 0) return 1;
  const ratio = value / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/** Format a `YYYY-MM-DD` date for tooltip display. */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });
}

/** Build the activity-breakdown tooltip string for a day. */
function formatTooltip(date: string, activity: DayActivity): string {
  const label = formatDate(date);
  if (activity.total === 0) return `No activity on ${label}`;
  const parts: string[] = [];
  if (activity.created > 0) parts.push(`${activity.created} created`);
  if (activity.reviewed > 0) parts.push(`${activity.reviewed} reviewed`);
  if (activity.read > 0) parts.push(`${activity.read} read`);
  return `${parts.join(', ')} — ${label}`;
}

/** The y-coordinate of the day-of-week label for a given row (0-6). */
export function dayLabelY(row: number): number {
  return TOP_PAD + row * CELL_STEP + CELL_SIZE;
}

/**
 * Build the heatmap SVG model from the raw activity map: 52 full weeks + today,
 * aligned so each column is a Sunday-anchored week.
 */
export function buildCalendarModel(data: HeatmapData): CalendarModel {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Go back 364 days (~52 full weeks + today), then align to the prior Sunday.
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  start.setDate(start.getDate() - start.getDay());

  interface RawDay { date: string; row: number; col: number; activity: DayActivity }
  const raw: RawDay[] = [];
  let col = 0;
  const cursor = new Date(start);
  while (cursor <= today) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const entry = data[dateStr];
    raw.push({
      date: dateStr,
      row: cursor.getDay(),
      col,
      activity: {
        total: entry?.total ?? 0,
        created: entry?.created ?? 0,
        reviewed: entry?.reviewed ?? 0,
        read: entry?.read ?? 0
      }
    });
    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getDay() === 0) col++;
  }
  const weeks = col + 1;
  const maxVal = Math.max(...raw.map((d) => d.activity.total), 1);

  const cells: CalendarCell[] = raw.map((d) => ({
    date: d.date,
    total: d.activity.total,
    x: LEFT_PAD + d.col * CELL_STEP,
    y: TOP_PAD + d.row * CELL_STEP,
    fill: COLORS[colorLevel(d.activity.total, maxVal)],
    label: formatTooltip(d.date, d.activity)
  }));

  // Month labels: at the first Sunday (row 0) of each month.
  const monthLabels: MonthLabel[] = [];
  const placed = new Set<number>();
  for (const d of raw) {
    if (d.row !== 0) continue;
    const m = new Date(d.date + 'T00:00:00').getMonth();
    if (placed.has(m)) continue;
    placed.add(m);
    monthLabels.push({ x: LEFT_PAD + d.col * CELL_STEP, text: MONTHS[m] });
  }

  return {
    cells,
    monthLabels,
    width: LEFT_PAD + weeks * CELL_STEP,
    height: TOP_PAD + 7 * CELL_STEP
  };
}
