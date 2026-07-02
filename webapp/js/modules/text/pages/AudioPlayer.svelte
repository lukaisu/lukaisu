<!--
  Audio Player — Svelte 5 port of the Alpine `audioPlayer` component
  (`media/audio_player_alpine.ts`).

  The Alpine component does NOT use the `Html5AudioPlayer` engine
  (`media/html5_audio_player.ts`, which drives the legacy server view's
  `.lukaisu-audio-*` markup + id-based <select>s); it manages a bare native
  <audio> element directly. This port keeps that contract: it owns a single
  <audio> element via `bind:this`, wires its native events into Svelte `$state`,
  and re-expresses every method (play/pause/stop, seek, volume/mute, skip,
  playback-rate, A-B-less repeat loop, skip-seconds) at behavioral parity. The
  control markup mirrors `Text/Views/audio_player.php` exactly (same classes,
  icons and conditional icon swaps — the prerendered `read.html` had dropped the
  play/pause + volume `x-show` toggles; this restores them).

  Config source: it fetches GET /texts/{id}/audio via `TextsApi.getAudio` (the
  same endpoint + shape the Alpine `loadAudioFromApi` used), which returns the
  media uri, the saved start position (offset) and the persisted player settings
  (repeat / skip-seconds / playback-rate). The host (`TextReaderApp`) only mounts
  this island when the loaded text has audio (`store.audioUri`); the player
  additionally keeps itself hidden until its config resolves, mirroring the
  Alpine `x-show="hasAudio"`.

  Persistence parity: the Alpine component restores the start position (applied
  on `loadedmetadata`) and persists only the three player *settings*
  (`currentplaybackrate`, `currentplayerrepeatmode`, `currentplayerseconds`) via
  `saveSetting`; it never writes the live playback position back. This port does
  the same.

  The Alpine component stays in place as the PWA renderer (it still backs the
  server build and is registered for `x-data="audioPlayer"`); the two coexist
  until the PWA retires.

  @license Unlicense <http://unlicense.org/>
-->
<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { initIcons } from '@shared/icons/lucide_icons';
  import { saveSetting } from '@shared/utils/ajax_utilities';
  import { TextsApi } from '@modules/text/api/texts_api';

  // Playback-rate steps (0.5x–1.5x) and skip-seconds options — same values as
  // the Alpine component's PLAYBACK_RATES / SKIP_OPTIONS.
  const PLAYBACK_RATES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
  const SKIP_OPTIONS = [1, 2, 3, 4, 5, 10, 15, 20, 25, 30];

  // The reader passes the text id; the player fetches its own audio config from
  // the API (matching the Alpine `loadAudioFromApi` path).
  let { textId = 0 }: { textId?: number } = $props();

  // Native <audio> element (created in markup, wired in onMount).
  let audioEl = $state<HTMLAudioElement | null>(null);

  // Reactive player state (was the Alpine component's `$data`).
  let isPlaying = $state(false);
  let isMuted = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(1);
  let playbackRate = $state(1.0);
  let repeatMode = $state(false);
  let skipSeconds = $state(5);
  /** Revealed only once the text's audio config has loaded (Alpine x-show). */
  let hasAudio = $state(false);

  // Derived display values (were Alpine getters).
  const progressPercent = $derived(duration <= 0 ? 0 : (currentTime / duration) * 100);
  const currentTimeFormatted = $derived(formatTime(currentTime));
  const durationFormatted = $derived(formatTime(duration));
  const playbackRateFormatted = $derived(playbackRate.toFixed(1) + 'x');

  function formatTime(seconds: number): string {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // --- Native <audio> event handlers (mirrors the Alpine init() listeners) ----
  function onLoadedMetadata(): void {
    if (!audioEl) return;
    duration = audioEl.duration;
  }

  function onTimeUpdate(): void {
    if (!audioEl) return;
    currentTime = audioEl.currentTime;
  }

  function onPlay(): void {
    if (!audioEl) return;
    isPlaying = true;
    audioEl.playbackRate = playbackRate;
  }

  function onPause(): void {
    isPlaying = false;
  }

  function onEnded(): void {
    if (!audioEl) return;
    if (repeatMode) {
      audioEl.currentTime = 0;
      void audioEl.play();
    } else {
      isPlaying = false;
    }
  }

  function onVolumeChange(): void {
    if (!audioEl) return;
    volume = audioEl.volume;
    isMuted = audioEl.muted;
  }

  // --- Playback controls ------------------------------------------------------
  function play(): void {
    void audioEl?.play();
  }

  function pause(): void {
    audioEl?.pause();
  }

  function togglePlay(): void {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }

  function stop(): void {
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
    }
  }

  // --- Seeking ----------------------------------------------------------------
  function seekTo(percent: number): void {
    if (audioEl && duration > 0) {
      audioEl.currentTime = (percent / 100) * duration;
    }
  }

  function seekFromEvent(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const percent = ((event.clientX - rect.left) / rect.width) * 100;
    seekTo(Math.max(0, Math.min(100, percent)));
  }

  function skipBackward(): void {
    if (audioEl) {
      audioEl.currentTime = Math.max(0, audioEl.currentTime - skipSeconds);
    }
  }

  function skipForward(): void {
    if (audioEl) {
      audioEl.currentTime = Math.min(duration, audioEl.currentTime + skipSeconds);
    }
  }

  // --- Volume -----------------------------------------------------------------
  function setVolume(vol: number): void {
    if (audioEl) {
      audioEl.volume = Math.max(0, Math.min(1, vol));
    }
  }

  function setVolumeFromEvent(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    setVolume(Math.max(0, Math.min(1, percent)));
  }

  function toggleMute(): void {
    if (audioEl) {
      audioEl.muted = !audioEl.muted;
    }
  }

  // --- Speed ------------------------------------------------------------------
  function setPlaybackRate(rate: number): void {
    playbackRate = Math.max(0.5, Math.min(1.5, rate));
    if (audioEl) {
      audioEl.playbackRate = playbackRate;
    }
    // Persisted as an integer x10 (10 = 1.0x), matching the Alpine component.
    saveSetting('currentplaybackrate', String(Math.round(playbackRate * 10)));
  }

  function slower(): void {
    const i = PLAYBACK_RATES.findIndex((r) => Math.abs(r - playbackRate) < 0.05);
    if (i > 0) {
      setPlaybackRate(PLAYBACK_RATES[i - 1]);
    } else if (playbackRate > PLAYBACK_RATES[0]) {
      setPlaybackRate(PLAYBACK_RATES[0]);
    }
  }

  function faster(): void {
    const i = PLAYBACK_RATES.findIndex((r) => Math.abs(r - playbackRate) < 0.05);
    if (i < PLAYBACK_RATES.length - 1 && i >= 0) {
      setPlaybackRate(PLAYBACK_RATES[i + 1]);
    } else if (playbackRate < PLAYBACK_RATES[PLAYBACK_RATES.length - 1]) {
      const next = PLAYBACK_RATES.find((r) => r > playbackRate);
      if (next) {
        setPlaybackRate(next);
      }
    }
  }

  function resetSpeed(): void {
    setPlaybackRate(1.0);
  }

  // --- Repeat -----------------------------------------------------------------
  function toggleRepeat(): void {
    repeatMode = !repeatMode;
    if (audioEl) {
      audioEl.loop = repeatMode;
    }
    saveSetting('currentplayerrepeatmode', repeatMode ? '1' : '0');
  }

  // --- Skip seconds -----------------------------------------------------------
  function setSkipSeconds(seconds: number): void {
    skipSeconds = seconds;
    saveSetting('currentplayerseconds', String(seconds));
  }

  // Re-hydrate lucide icons after reveal and whenever a conditional icon swaps
  // (play↔pause, volume level/mute) — the {#if} blocks replace the <i> nodes, so
  // initIcons must re-run to turn the new placeholders into SVGs. Same approach
  // as TextReaderApp's icon effect.
  $effect(() => {
    void hasAudio;
    void isPlaying;
    void isMuted;
    void volume;
    void tick().then(() => initIcons());
  });

  onMount(async () => {
    const audio = audioEl;
    if (!audio) return;

    // Wire native events before the source loads (the API fetch below is async,
    // so listeners are in place when `loadedmetadata`/`timeupdate` first fire).
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('volumechange', onVolumeChange);

    // Seed volume/mute from the element's initial state.
    volume = audio.volume;
    isMuted = audio.muted;

    // Fetch the text's audio config (uri + saved position + player settings).
    try {
      const res = await TextsApi.getAudio(textId);
      const info = res.data;
      if (!info || !info.uri) return; // No audio → stay hidden.

      repeatMode = info.playerSettings.repeatMode;
      skipSeconds = info.playerSettings.skipSeconds || 5;
      // playbackRate is stored as an integer x10 (10 = 1.0x).
      playbackRate = (info.playerSettings.playbackRate || 10) / 10;
      // Note: like the Alpine component, restored `repeatMode` does not set
      // `audio.loop` here — only an explicit `toggleRepeat` does; the `ended`
      // handler already re-starts playback when `repeatMode` is set.

      if (info.uri && !audio.src) {
        audio.src = info.uri;
      }

      // Restore the saved start position once metadata is available.
      if (info.position > 0) {
        audio.addEventListener(
          'loadedmetadata',
          () => {
            audio.currentTime = info.position;
          },
          { once: true }
        );
      }

      hasAudio = true;
    } catch (e) {
      console.error('Failed to load audio config:', e);
    }
  });

  onDestroy(() => {
    if (!audioEl) return;
    audioEl.removeEventListener('loadedmetadata', onLoadedMetadata);
    audioEl.removeEventListener('timeupdate', onTimeUpdate);
    audioEl.removeEventListener('play', onPlay);
    audioEl.removeEventListener('pause', onPause);
    audioEl.removeEventListener('ended', onEnded);
    audioEl.removeEventListener('volumechange', onVolumeChange);
  });
</script>

<!-- Mirrors Text/Views/audio_player.php; hidden until config resolves (was
     x-show="hasAudio"). -->
<div class="box py-2 px-4 mb-0" style="border-radius: 0;{hasAudio ? '' : ' display: none;'}">
  <div class="audio-player-container">
    <!-- Source + offset + settings are set from the API in onMount. -->
    <audio bind:this={audioEl} preload="auto"></audio>

    <div class="audio-player">
      <!-- Play/Pause/Stop controls -->
      <div class="audio-player-controls">
        <button
          type="button"
          class="button is-small"
          class:is-primary={isPlaying}
          class:is-light={!isPlaying}
          onclick={togglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {#if isPlaying}
            <i data-lucide="pause" class="icon" style="width:16px;height:16px"></i>
          {:else}
            <i data-lucide="play" class="icon" style="width:16px;height:16px"></i>
          {/if}
        </button>
        <button type="button" class="button is-small is-light" onclick={stop} title="Stop">
          <i data-lucide="square" class="icon" style="width:16px;height:16px"></i>
        </button>
      </div>

      <!-- Progress section -->
      <div class="audio-player-progress">
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="progress-bar-container" onclick={seekFromEvent} title="Click to seek">
          <div class="progress-bar" style="width: {progressPercent}%"></div>
        </div>
        <div class="time-display">
          <span>{currentTimeFormatted}</span>
          <span class="has-text-grey-light">/</span>
          <span>{durationFormatted}</span>
        </div>
      </div>

      <!-- Volume control -->
      <div class="audio-player-volume">
        <button
          type="button"
          class="button is-small is-light"
          onclick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {#if isMuted || volume === 0}
            <i data-lucide="volume-x" class="icon" style="width:16px;height:16px"></i>
          {:else if volume > 0.5}
            <i data-lucide="volume-2" class="icon" style="width:16px;height:16px"></i>
          {:else}
            <i data-lucide="volume-1" class="icon" style="width:16px;height:16px"></i>
          {/if}
        </button>
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="volume-bar-container" onclick={setVolumeFromEvent} title="Adjust volume">
          <div class="volume-bar" style="width: {isMuted ? 0 : volume * 100}%"></div>
        </div>
      </div>

      <!-- Skip controls -->
      <div class="audio-player-skip">
        <button
          type="button"
          class="button is-small is-light"
          onclick={skipBackward}
          title={'Skip back ' + skipSeconds + 's'}
        >
          <i data-lucide="skip-back" class="icon" style="width:16px;height:16px"></i>
        </button>
        <div class="dropdown is-hoverable is-up">
          <div class="dropdown-trigger">
            <button type="button" class="button is-small is-light" aria-haspopup="true">
              <span class="is-size-7">{skipSeconds}s</span>
            </button>
          </div>
          <div class="dropdown-menu" role="menu">
            <div class="dropdown-content">
              {#each SKIP_OPTIONS as sec (sec)}
                <!-- svelte-ignore a11y_click_events_have_key_events, a11y_missing_attribute -->
                <a
                  class="dropdown-item is-size-7"
                  class:is-active={skipSeconds === sec}
                  role="button"
                  tabindex="0"
                  onclick={() => setSkipSeconds(sec)}>{sec}s</a
                >
              {/each}
            </div>
          </div>
        </div>
        <button
          type="button"
          class="button is-small is-light"
          onclick={skipForward}
          title={'Skip forward ' + skipSeconds + 's'}
        >
          <i data-lucide="skip-forward" class="icon" style="width:16px;height:16px"></i>
        </button>
      </div>

      <!-- Speed controls -->
      <div class="audio-player-speed">
        <button
          type="button"
          class="button is-small is-light"
          onclick={slower}
          title="Slower"
          disabled={playbackRate <= 0.5}
        >
          <i data-lucide="minus" class="icon" style="width:14px;height:14px"></i>
        </button>
        <button
          type="button"
          class="button is-small"
          class:is-light={playbackRate === 1.0}
          class:is-warning={playbackRate !== 1.0}
          onclick={resetSpeed}
          title="Reset to 1x speed"
        >
          <span class="is-size-7">{playbackRateFormatted}</span>
        </button>
        <button
          type="button"
          class="button is-small is-light"
          onclick={faster}
          title="Faster"
          disabled={playbackRate >= 1.5}
        >
          <i data-lucide="plus" class="icon" style="width:14px;height:14px"></i>
        </button>
      </div>

      <!-- Repeat toggle -->
      <div class="audio-player-repeat">
        <button
          type="button"
          class="button is-small"
          class:is-info={repeatMode}
          class:is-light={!repeatMode}
          onclick={toggleRepeat}
          title={repeatMode ? 'Repeat: ON' : 'Repeat: OFF'}
        >
          <i data-lucide="repeat" class="icon" style="width:16px;height:16px"></i>
        </button>
      </div>
    </div>
  </div>
</div>
