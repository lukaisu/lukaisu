<!--
  Statistics — Svelte 5 port of the three coupled Alpine regions of the retired
  `statistics.php` view: `streakDisplay` (the streak + today summary), the
  `calendarHeatmap` (a GitHub-style contribution grid), and `statisticsApp` (the
  Chart.js intensity + frequency charts).

  They were ported together because they share one page: this island owns the
  streak/today state, builds the heatmap SVG declaratively (the Alpine version
  built it via `createElementNS`; the visual output is byte-identical — same
  cell size, palette, month/day axes), and lazily dynamic-imports Chart.js only
  when there is data to plot. Behaviour is a faithful port — same endpoints,
  same request shapes, same charts; only the rendering is Svelte.

  Server-gated (Job-B-style): the statistics are computed from the connected
  server's database, so the page only mounts this island when a server is
  connected (the gate lives in `app/statistics.ts`, mirroring feeds.ts). The
  intensity + frequency data arrive as props from `/profile/statistics/config`;
  the streak + calendar are fetched here from `/api/v1/activity/{dashboard,calendar}`,
  exactly as the Alpine components did.

  Lucide icons in the markup are re-hydrated from a `$effect` (the role the
  Alpine `lukaisu:contentLoaded` dispatch played).

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Chart as ChartType } from 'chart.js';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { t } from '@shared/i18n/translator';
  import { apiGet } from '@shared/api/client';
  import { loadChartJs } from '@shared/utils/chart_loader';
  import { statusLabel } from '@shared/stores/statuses';
  import type {
    FrequencyTotals,
    IntensityLanguageData
  } from '@modules/activity/api/statistics_api';
  import {
    buildCalendarModel,
    dayLabelY,
    CELL_SIZE,
    DAY_LABELS,
    type CalendarModel,
    type HeatmapData
  } from '@modules/activity/calendar_model';

  const { intensity, frequency }: {
    intensity: IntensityLanguageData[];
    frequency: FrequencyTotals;
  } = $props();

  /**
   * Pastel palette for the charts — deliberately distinct from the saturated
   * reading-view status palette (issue #238). The frequency chart reuses three
   * of these as generic Created/Activity/Known series colours, so they are kept
   * local rather than sourced from the status store.
   */
  const STATUS_COLORS = {
    s1: '#F5B8A9',
    s2: '#F5CCA9',
    s3: '#F5E1A9',
    s4: '#F5F3A9',
    s5: '#CCFFCC',
    s99: '#99DDDF'
  };

  // ── Streak + today summary (the Alpine `streakDisplay` component) ──────────
  interface DashboardResponse {
    streak?: {
      current_streak: number;
      best_streak: number;
      total_active_days: number;
    };
    today?: {
      terms_created: number;
      terms_reviewed: number;
      texts_read: number;
    };
  }

  let currentStreak = $state(0);
  let bestStreak = $state(0);
  let todayCreated = $state(0);
  let todayReviewed = $state(0);
  let todayTextsRead = $state(0);

  // These short strings were hardcoded English in the Alpine component (never
  // i18n keys), so the port keeps them verbatim.
  function streakLabel(n: number): string {
    return n === 1 ? '1 day' : n + ' days';
  }

  async function fetchDashboard(): Promise<void> {
    const res = await apiGet<DashboardResponse>('/activity/dashboard');
    const data = res.data;
    if (!data) {
      return;
    }
    if (data.streak) {
      currentStreak = data.streak.current_streak;
      bestStreak = data.streak.best_streak;
    }
    if (data.today) {
      todayCreated = data.today.terms_created;
      todayReviewed = data.today.terms_reviewed;
      todayTextsRead = data.today.texts_read;
    }
  }

  // ── Calendar heatmap (the Alpine `calendarHeatmap` component) ──────────────
  // The grid geometry lives in the framework-agnostic `calendar_model` module;
  // this component only fetches, holds state and renders it as SVG.
  let calLoading = $state(true);
  let calError = $state('');
  let calModel = $state<CalendarModel | null>(null);

  let tooltip = $state<{ show: boolean; x: number; y: number; text: string }>({
    show: false,
    x: 0,
    y: 0,
    text: ''
  });

  function showTip(event: MouseEvent, text: string): void {
    tooltip = { show: true, x: event.clientX + 8, y: event.clientY - 28, text };
  }

  function hideTip(): void {
    tooltip = { ...tooltip, show: false };
  }

  async function fetchCalendar(): Promise<void> {
    const res = await apiGet<HeatmapData>('/activity/calendar');
    calLoading = false;
    if (res.error || !res.data) {
      calError = 'Failed to load activity data';
      return;
    }
    calModel = buildCalendarModel(res.data);
  }

  // ── Charts (the Alpine `statisticsApp` component) ──────────────────────────
  let intensityCanvas = $state<HTMLCanvasElement | null>(null);
  let frequencyCanvas = $state<HTMLCanvasElement | null>(null);
  let intensityChart: ChartType | null = null;
  let frequencyChart: ChartType | null = null;

  let intensityOpen = $state(true);
  let frequencyOpen = $state(true);

  async function buildIntensityChart(canvas: HTMLCanvasElement): Promise<void> {
    const ChartClass = await loadChartJs();
    const labels = intensity.map((lang) => lang.name);
    const chartData = {
      labels,
      datasets: [
        { label: statusLabel(1), data: intensity.map((l) => l.s1), backgroundColor: STATUS_COLORS.s1 },
        { label: statusLabel(2), data: intensity.map((l) => l.s2), backgroundColor: STATUS_COLORS.s2 },
        { label: statusLabel(3), data: intensity.map((l) => l.s3), backgroundColor: STATUS_COLORS.s3 },
        { label: statusLabel(4), data: intensity.map((l) => l.s4), backgroundColor: STATUS_COLORS.s4 },
        { label: statusLabel(5), data: intensity.map((l) => l.s5), backgroundColor: STATUS_COLORS.s5 },
        { label: statusLabel(99), data: intensity.map((l) => l.s99), backgroundColor: STATUS_COLORS.s99 }
      ]
    };
    intensityChart = new ChartClass(canvas, {
      type: 'bar',
      data: chartData,
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              afterBody: (context) => {
                const dataIndex = context[0].dataIndex;
                const total = chartData.datasets.reduce(
                  (sum, ds) => sum + (ds.data[dataIndex] as number),
                  0
                );
                return 'Total active: ' + total;
              }
            }
          }
        },
        scales: {
          x: { stacked: true },
          y: { stacked: true, title: { display: true, text: 'Number of Terms' } }
        }
      }
    });
  }

  async function buildFrequencyChart(canvas: HTMLCanvasElement): Promise<void> {
    const ChartClass = await loadChartJs();
    const totals = frequency;
    const chartData = {
      labels: ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'Last 365 Days'],
      datasets: [
        {
          label: 'Created',
          data: [totals.ct, totals.cy, totals.cw, totals.cm, totals.ca],
          borderColor: STATUS_COLORS.s1,
          backgroundColor: STATUS_COLORS.s1,
          tension: 0.3,
          fill: false
        },
        {
          label: 'Activity',
          data: [totals.at, totals.ay, totals.aw, totals.am, totals.aa],
          borderColor: STATUS_COLORS.s3,
          backgroundColor: STATUS_COLORS.s3,
          tension: 0.3,
          fill: false
        },
        {
          label: 'Known',
          data: [totals.kt, totals.ky, totals.kw, totals.km, totals.ka],
          borderColor: STATUS_COLORS.s5,
          backgroundColor: STATUS_COLORS.s5,
          tension: 0.3,
          fill: false
        }
      ]
    };
    frequencyChart = new ChartClass(canvas, {
      type: 'line',
      data: chartData,
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'Number of Terms' } }
        }
      }
    });
  }

  onMount(() => {
    void fetchDashboard();
    void fetchCalendar();
    // Both sections default open, so the canvases are visible at mount and the
    // (responsive) charts size correctly. Chart.js is dynamic-imported only
    // when there is data to plot.
    if (intensity.length > 0 && intensityCanvas) {
      void buildIntensityChart(intensityCanvas);
    }
    if (frequencyCanvas) {
      void buildFrequencyChart(frequencyCanvas);
    }
    return () => {
      intensityChart?.destroy();
      frequencyChart?.destroy();
    };
  });

  // Re-hydrate lucide icons after client-rendered `<i data-lucide>` nodes change.
  $effect(() => {
    void calModel;
    void calLoading;
    void intensityOpen;
    void frequencyOpen;
    void tick().then(() => initIcons());
  });
</script>

<div class="container">

  <!-- Activity & Streak Section -->
  <section class="box mb-4">
    <h2 class="title is-4 mb-4">
      <span class="icon-text">
        <span class="icon has-text-warning">
          <i data-lucide="flame" class="icon"></i>
        </span>
        <span>{t('user.statistics.activity_title')}</span>
      </span>
    </h2>

    <!-- Streak stats row -->
    <div class="columns is-mobile is-multiline mb-3">
      <div class="column is-4-desktop is-6-mobile">
        <div class="box has-background-light has-text-centered py-3">
          <p class="heading">{t('user.statistics.current_streak')}</p>
          <p class="title is-5">{streakLabel(currentStreak)}</p>
        </div>
      </div>
      <div class="column is-4-desktop is-6-mobile">
        <div class="box has-background-light has-text-centered py-3">
          <p class="heading">{t('user.statistics.best_streak')}</p>
          <p class="title is-5">{streakLabel(bestStreak)}</p>
        </div>
      </div>
      <div class="column is-4-desktop is-12-mobile">
        <div class="box has-background-light has-text-centered py-3">
          <p class="heading">{t('user.statistics.today')}</p>
          <p class="is-size-6">
            <span class="has-text-weight-semibold">{todayCreated}</span>
            {t('user.statistics.today_created')},
            <span class="has-text-weight-semibold">{todayReviewed}</span>
            {t('user.statistics.today_reviewed')},
            <span class="has-text-weight-semibold">{todayTextsRead}</span>
            {t('user.statistics.today_read')}
          </p>
        </div>
      </div>
    </div>

    <!-- Calendar heatmap -->
    <div>
      <div style="overflow-x: auto;">
        <p class="heading mb-2">{t('user.statistics.activity_last_12_months')}</p>
        {#if calLoading}
          <div class="has-text-centered py-3">
            <span class="has-text-grey-light is-size-7">{t('user.statistics.loading_activity')}</span>
          </div>
        {/if}
        {#if calError}
          <div class="has-text-danger is-size-7">{calError}</div>
        {/if}
        <div style="min-width: 720px;">
          {#if calModel}
            <svg
              width={calModel.width}
              height={calModel.height}
              viewBox={`0 0 ${calModel.width} ${calModel.height}`}
              style="display: block;"
            >
              {#each DAY_LABELS as label, row (row)}
                {#if label}
                  <text x="0" y={dayLabelY(row)} font-size="10" fill="#767676">{label}</text>
                {/if}
              {/each}
              {#each calModel.monthLabels as m (m.text)}
                <text x={m.x} y="10" font-size="10" fill="#767676">{m.text}</text>
              {/each}
              {#each calModel.cells as cell (cell.date)}
                <rect
                  x={cell.x}
                  y={cell.y}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  rx="2"
                  fill={cell.fill}
                  role="img"
                  aria-label={cell.label}
                  onmouseenter={(e) => showTip(e, cell.label)}
                  onmouseleave={hideTip}
                ></rect>
              {/each}
            </svg>
          {/if}
        </div>
      </div>
    </div>
  </section>

  <!-- Learning Intensity Section -->
  <section class="box mb-4">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <header class="collapsible-header" onclick={() => (intensityOpen = !intensityOpen)}>
      <h2 class="title is-4 mb-0">
        <span class="icon-text">
          <span class="icon has-text-info">
            <i data-lucide="bar-chart-2" class="icon"></i>
          </span>
          <span>{t('user.statistics.intensity_title')}</span>
        </span>
      </h2>
      <span class="icon collapse-icon" class:is-rotated={intensityOpen}>
        <i data-lucide="chevron-down"></i>
      </span>
    </header>

    <div class="collapsible-content" hidden={!intensityOpen}>
      <div class="box mb-4 mt-4">
        <h3 class="subtitle is-6">{t('user.statistics.intensity_chart_title')}</h3>
        <canvas bind:this={intensityCanvas} height="100"></canvas>
      </div>
    </div>
  </section>

  <!-- Learning Frequency Section -->
  <section class="box mb-4">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <header class="collapsible-header" onclick={() => (frequencyOpen = !frequencyOpen)}>
      <h2 class="title is-4 mb-0">
        <span class="icon-text">
          <span class="icon has-text-success">
            <i data-lucide="trending-up" class="icon"></i>
          </span>
          <span>{t('user.statistics.frequency_title')}</span>
        </span>
      </h2>
      <span class="icon collapse-icon" class:is-rotated={frequencyOpen}>
        <i data-lucide="chevron-down"></i>
      </span>
    </header>

    <div class="collapsible-content" hidden={!frequencyOpen}>
      <div class="box mb-4 mt-4">
        <h3 class="subtitle is-6">{t('user.statistics.frequency_chart_title')}</h3>
        <canvas bind:this={frequencyCanvas} height="80"></canvas>
      </div>
    </div>
  </section>

  <!-- Back Button -->
  <div class="field">
    <div class="control">
      <a href="/" class="button is-light">
        <span class="icon"><i data-lucide="arrow-left"></i></span>
        <span>{t('user.statistics.back_to_main')}</span>
      </a>
    </div>
  </div>
</div>

{#if tooltip.show}
  <div
    style="position:fixed;padding:4px 8px;background:#24292f;color:#fff;border-radius:4px;font-size:11px;pointer-events:none;z-index:100;left:{tooltip.x}px;top:{tooltip.y}px;"
  >
    {tooltip.text}
  </div>
{/if}

<style>
  /* Collapsible section styles (ported verbatim from statistics.php). */
  .collapsible-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    user-select: none;
  }

  .collapsible-header:hover {
    opacity: 0.8;
  }

  .collapse-icon {
    transition: transform 0.2s ease;
  }

  .collapse-icon.is-rotated {
    transform: rotate(180deg);
  }
</style>
