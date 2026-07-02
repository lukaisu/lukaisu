/**
 * Local API router — the seam that lets the existing rendering code keep calling
 * `/api/v1` while the data is served from the on-device database.
 *
 * `apiGet/apiPost/apiPut/apiDelete/apiPostForm` in the shared API client consult
 * `routeLocal` first. When local-first mode is enabled and an endpoint is owned
 * by the local data layer, the matching repository handles it and the request
 * never touches the network; otherwise the call falls through to HTTP (used for
 * server-enhanced features like CJK tokenization, TTS and content discovery).
 *
 * Local-first mode defaults to OFF so existing same-origin/server installs (and
 * the test suite, which mocks `fetch`) are unchanged; the packaged offline app
 * turns it on at boot via {@link setLocalFirst}.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import {
  listLanguages,
  getDefinitions,
  getLanguage,
  getLanguageStats,
  listLanguagesWithArchivedTexts,
  createLanguage,
  updateLanguage,
  deleteLanguage,
  setDefaultLanguage,
} from './repositories/languages';
import {
  getTextWords,
  getAudioInfo,
  getText,
  updateText,
  checkText,
  createText,
  getStatistics,
  getTextsByLanguage,
  getArchivedTextsByLanguage,
  bulkAction as textBulkAction,
  archiveText,
  unarchiveText,
  deleteText,
  markAllWellKnown,
  markAllIgnored,
  reparseLanguage,
} from './repositories/texts';
import { getPrintItems } from './repositories/print';
import {
  setStatus,
  incrementStatus,
  createQuick,
  createFull,
  createStandalone,
  updateFull,
  updateTranslation,
  addWithTranslation,
  deleteTerm,
  getForEdit,
  getTerm,
} from './repositories/terms';
import {
  getReviewConfig,
  getNextWord,
  getTomorrowCount,
  updateStatus as reviewUpdateStatus,
  applyGrade as reviewApplyGrade,
  getTableWords,
} from './repositories/review';
import type { ReviewCard, ReviewGradeRequest } from '@modules/review/api/review_api';
import {
  getList,
  getFilterOptions,
  inlineEdit,
  bulkAction as wordsBulkAction,
} from './repositories/words';
import { getNavbarData } from './repositories/navbar';
import { getSentencesWithTerm } from './repositories/sentences';
import { setSetting, setCurrentLanguageId } from './repositories/settings';
import {
  getAllTags,
  getAllTermTags,
  getAllTextTags,
  listTagsForManagement,
  renameTermTag,
  deleteTermTag,
  renameTextTag,
  deleteTextTag,
} from './repositories/tags';
import { getStreak } from './repositories/activity';
import {
  gutenbergSuggestions,
  librarySearch,
  gdlSuggestions,
  readerLevel,
  analyzeCoverage,
  analyzeEpubCoverage,
  importGutenbergText,
  importEpubText,
} from './repositories/content';
import { getI18nBundle } from './i18n';
import type {
  LanguageCreateRequest,
} from '@modules/language/api/languages_api';
import type {
  TermCreateFullRequest,
  TermCreateStandaloneRequest,
  TermUpdateFullRequest,
} from '@modules/vocabulary/api/terms_api';
import type { WordListFilters } from '@modules/vocabulary/api/words_api';

const LOCAL_FIRST_KEY = 'lukaisu.localFirst';

let localFirstOverride: boolean | null = null;

function readLocalFirst(): boolean {
  try {
    return localStorage.getItem(LOCAL_FIRST_KEY) === '1';
  } catch {
    return false;
  }
}

/** Whether the on-device data layer is the default source. */
export function isLocalFirst(): boolean {
  return localFirstOverride ?? readLocalFirst();
}

/** Enable/disable local-first mode (persisted across launches). */
export function setLocalFirst(enabled: boolean): void {
  localFirstOverride = enabled;
  try {
    if (enabled) {
      localStorage.setItem(LOCAL_FIRST_KEY, '1');
    } else {
      localStorage.removeItem(LOCAL_FIRST_KEY);
    }
  } catch {
    // localStorage unavailable: the in-memory override still applies.
  }
}

/** Result of attempting to serve a request locally. */
export interface LocalRouteResult {
  handled: boolean;
  data?: unknown;
  error?: string;
}

type Payload = Record<string, unknown> | undefined;

function num(value: unknown): number {
  return typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
}

function str(value: unknown): string {
  return value == null ? '' : String(value);
}

/** Wrap a repository result, surfacing bare `{ error }` objects as errors. */
function wrap(result: unknown): LocalRouteResult {
  if (result && typeof result === 'object' && 'error' in result) {
    const keys = Object.keys(result as Record<string, unknown>);
    if (keys.length === 1) {
      return { handled: true, error: str((result as { error: unknown }).error) };
    }
  }
  return { handled: true, data: result };
}

const NOT_HANDLED: LocalRouteResult = { handled: false };

async function routeGet(path: string, p: Record<string, unknown>): Promise<LocalRouteResult> {
  if (path === '/navbar') {
    return wrap(await getNavbarData());
  }
  if (path === '/i18n' || path.startsWith('/i18n/')) {
    // Only English is bundled; any requested locale resolves to it offline.
    return wrap(getI18nBundle());
  }
  if (path === '/languages') {
    return wrap(await listLanguages());
  }
  if (path === '/languages/definitions') {
    return wrap(getDefinitions());
  }
  if (path === '/languages/with-archived-texts') {
    return wrap(await listLanguagesWithArchivedTexts());
  }
  let m = path.match(/^\/languages\/(\d+)\/stats$/);
  if (m) {
    return wrap(await getLanguageStats(num(m[1])));
  }
  m = path.match(/^\/languages\/(\d+)$/);
  if (m) {
    return wrap(await getLanguage(num(m[1])));
  }
  m = path.match(/^\/texts\/(\d+)\/words$/);
  if (m) {
    return wrap(await getTextWords(num(m[1])));
  }
  m = path.match(/^\/texts\/(\d+)\/print-items$/);
  if (m) {
    return wrap(await getPrintItems(num(m[1])));
  }
  m = path.match(/^\/texts\/(\d+)\/audio$/);
  if (m) {
    return wrap(await getAudioInfo(num(m[1])));
  }
  if (/^\/texts\/\d+\/book-context$/.test(path)) {
    // Offline texts are standalone — there is no on-device book model.
    return { handled: true, data: { book: null } };
  }
  m = path.match(/^\/texts\/by-language\/(\d+)$/);
  if (m) {
    return wrap(
      await getTextsByLanguage(num(m[1]), num(p.page) || 1, num(p.per_page) || 10, num(p.sort) || 1)
    );
  }
  m = path.match(/^\/texts\/archived-by-language\/(\d+)$/);
  if (m) {
    return wrap(
      await getArchivedTextsByLanguage(
        num(m[1]),
        num(p.page) || 1,
        num(p.per_page) || 10,
        num(p.sort) || 1
      )
    );
  }
  if (path === '/texts/statistics') {
    const ids = str(p.text_ids)
      .split(',')
      .map((s) => parseInt(s, 10))
      .filter((n) => !Number.isNaN(n));
    return wrap(await getStatistics(ids));
  }
  // Content discovery (catalog browse/search + reader level + the Gutenberg /
  // GDL-EPUB coverage previews). These reach the external catalogs CORS-free and
  // measure results against on-device vocabulary; arbitrary-URL/RSS extraction
  // stays unrouted here so it falls through to a server when one is connected.
  if (path === '/texts/gutenberg-suggestions') {
    return wrap(await gutenbergSuggestions(num(p.language_id), num(p.page) || 1));
  }
  if (path === '/texts/library-search') {
    return wrap(await librarySearch(str(p.q), num(p.language_id), num(p.page) || 1));
  }
  if (path === '/texts/gdl-search') {
    return wrap(await gdlSuggestions(num(p.language_id), num(p.page) || 1));
  }
  if (path === '/texts/reader-level') {
    return wrap(await readerLevel(num(p.language_id)));
  }
  if (path === '/texts/library-preview') {
    return wrap(await analyzeCoverage(str(p.url), num(p.language_id)));
  }
  if (path === '/texts/library-preview-epub') {
    // GDL coverage preview — local-first only (EPUB parsing exists only on the
    // client); the GDL UI shows the preview action only when local-first is on.
    return wrap(await analyzeEpubCoverage(str(p.url), num(p.language_id)));
  }
  m = path.match(/^\/texts\/(\d+)$/);
  if (m) {
    return wrap(await getText(num(m[1])));
  }
  if (path === '/terms/for-edit') {
    return wrap(
      await getForEdit(num(p.term_id), num(p.ord), p.wid != null ? num(p.wid) : undefined)
    );
  }
  m = path.match(/^\/sentences-with-term\/(\d+)$/);
  if (m) {
    return wrap(await getSentencesWithTerm(num(p.language_id), str(p.term_lc), num(m[1])));
  }
  if (path === '/sentences-with-term') {
    return wrap(await getSentencesWithTerm(num(p.language_id), str(p.term_lc)));
  }
  if (path === '/terms/list') {
    return wrap(await getList(p as WordListFilters));
  }
  if (path === '/terms/filter-options') {
    return wrap(await getFilterOptions(p.language_id != null ? num(p.language_id) : null));
  }
  // Single term by id — backs the standalone edit form (word.html). Must come
  // after the literal /terms/* paths above (none are all-digits, so no clash).
  m = path.match(/^\/terms\/(\d+)$/);
  if (m) {
    return wrap(await getTerm(num(m[1])));
  }
  if (path === '/tags') {
    return wrap(await getAllTags());
  }
  if (path === '/tags/manage') {
    return wrap(await listTagsForManagement());
  }
  if (path === '/tags/term') {
    return wrap(await getAllTermTags());
  }
  if (path === '/tags/text') {
    return wrap(await getAllTextTags());
  }
  if (path === '/activity/streak') {
    return wrap(await getStreak());
  }
  if (path === '/review/config') {
    return wrap(
      await getReviewConfig({
        lang: p.lang != null ? num(p.lang) : undefined,
        text: p.text != null ? num(p.text) : undefined,
        selection: p.selection != null ? num(p.selection) : undefined,
      })
    );
  }
  if (path === '/review/next-word') {
    return wrap(
      await getNextWord({
        reviewKey: str(p.review_key),
        selection: str(p.selection),
        wordMode: p.word_mode === true || p.word_mode === 'true',
        lgId: num(p.language_id),
        wordRegex: str(p.word_regex),
        type: num(p.type),
      })
    );
  }
  if (path === '/review/tomorrow-count') {
    return wrap(await getTomorrowCount(str(p.review_key), str(p.selection)));
  }
  if (path === '/review/table-words') {
    return wrap(await getTableWords(str(p.review_key), str(p.selection)));
  }
  return NOT_HANDLED;
}

async function routePost(path: string, p: Record<string, unknown>): Promise<LocalRouteResult> {
  if (path === '/settings') {
    const key = str(p.key);
    const value = str(p.value);
    if (key === 'currentlanguage') {
      // The navbar's language switcher (setLangAsync) posts the chosen id here.
      await setCurrentLanguageId(value ? num(value) : 0);
    } else {
      await setSetting(key, value);
    }
    return { handled: true, data: { message: 'Setting updated' } };
  }
  if (path === '/languages') {
    return wrap(await createLanguage(p as unknown as LanguageCreateRequest));
  }
  let m = path.match(/^\/languages\/(\d+)\/set-default$/);
  if (m) {
    return wrap(await setDefaultLanguage(num(m[1])));
  }
  m = path.match(/^\/languages\/(\d+)\/refresh$/);
  if (m) {
    const added = await reparseLanguage(num(m[1]));
    return {
      handled: true,
      data: {
        success: true,
        sentencesDeleted: 0,
        textItemsDeleted: 0,
        sentencesAdded: added,
        textItemsAdded: added,
      },
    };
  }
  if (path === '/texts') {
    // TextsApi.create posts the server contract's snake_case body
    // (language_id / source_uri / audio_uri); accept that and the camelCase
    // TextCreateRequest shape so both callers work on-device.
    const sourceUri = p.source_uri ?? p.sourceUri;
    const audioUri = p.audio_uri ?? p.audioUri;
    return wrap(
      await createText({
        title: str(p.title),
        langId: num(p.language_id ?? p.langId),
        text: str(p.text),
        sourceUri: sourceUri != null ? str(sourceUri) : undefined,
        audioUri: audioUri != null ? str(audioUri) : undefined,
        tags: Array.isArray(p.tags) ? (p.tags as string[]) : undefined,
      })
    );
  }
  if (path === '/texts/check') {
    // Parse-preview ("check a text"). Local-first only — the server's
    // /text/check is a native web-route form, not /api/v1.
    return wrap(await checkText({ langId: num(p.langId ?? p.language_id), text: str(p.text) }));
  }
  if (path === '/texts/import-gutenberg') {
    // Local-first import of a Gutenberg plain-text book: fetch CORS-free, strip
    // boilerplate, parse on-device. No server equivalent (the server has its
    // own URL-extract import flow), so this is local-first only.
    return wrap(
      await importGutenbergText(
        str(p.url),
        str(p.title),
        num(p.language_id ?? p.langId)
      )
    );
  }
  if (path === '/texts/import-epub') {
    // Local-first EPUB import (backs the GDL readers): download CORS-free,
    // unzip + extract spine text, parse on-device. The server has its own
    // upload/URL-extract EPUB flow, so this path is local-first only.
    return wrap(
      await importEpubText(
        str(p.url),
        str(p.title),
        num(p.language_id ?? p.langId)
      )
    );
  }
  m = path.match(/^\/texts\/(\d+)\/archive$/);
  if (m) {
    return wrap(await archiveText(num(m[1])));
  }
  m = path.match(/^\/texts\/(\d+)\/unarchive$/);
  if (m) {
    return wrap(await unarchiveText(num(m[1])));
  }
  if (path === '/terms') {
    return wrap(
      await addWithTranslation(str(p.text), num(p.language_id), str(p.translation))
    );
  }
  if (path === '/terms/quick') {
    return wrap(await createQuick(num(p.text_id), num(p.position), num(p.status) as 98 | 99));
  }
  if (path === '/terms/full') {
    return wrap(await createFull(p as unknown as TermCreateFullRequest));
  }
  if (path === '/terms/standalone') {
    return wrap(await createStandalone(p as unknown as TermCreateStandaloneRequest));
  }
  m = path.match(/^\/terms\/(\d+)\/status\/(.+)$/);
  if (m) {
    const id = num(m[1]);
    const target = m[2];
    if (target === 'up' || target === 'down') {
      return wrap(await incrementStatus(id, target));
    }
    return wrap(await setStatus(id, num(target)));
  }
  return NOT_HANDLED;
}

async function routePut(path: string, p: Record<string, unknown>): Promise<LocalRouteResult> {
  let m = path.match(/^\/terms\/(\d+)\/translation$/);
  if (m) {
    return wrap(await updateTranslation(num(m[1]), str(p.translation)));
  }
  m = path.match(/^\/terms\/(\d+)\/inline-edit$/);
  if (m) {
    return wrap(
      await inlineEdit(
        num(m[1]),
        str(p.field) as 'translation' | 'romanization',
        str(p.value)
      )
    );
  }
  if (path === '/terms/bulk-action') {
    return wrap(
      await wordsBulkAction(
        (p.ids as number[]) ?? [],
        str(p.action),
        p.data != null ? str(p.data) : undefined
      )
    );
  }
  if (path === '/texts/bulk-action') {
    return wrap(
      await textBulkAction(str(p.action) as 'archive' | 'delete', (p.ids as number[]) ?? [])
    );
  }
  m = path.match(/^\/texts\/(\d+)\/display-mode$/);
  if (m) {
    return { handled: true, data: { updated: true } };
  }
  m = path.match(/^\/texts\/(\d+)\/mark-all-wellknown$/);
  if (m) {
    return wrap(await markAllWellKnown(num(m[1])));
  }
  m = path.match(/^\/texts\/(\d+)\/mark-all-ignored$/);
  if (m) {
    return wrap(await markAllIgnored(num(m[1])));
  }
  if (path === '/review/status') {
    return wrap(
      await reviewUpdateStatus(
        num(p.term_id),
        p.status != null ? num(p.status) : undefined,
        p.change != null ? num(p.change) : undefined
      )
    );
  }
  if (path === '/review/grade') {
    return wrap(
      await reviewApplyGrade({
        term_id: num(p.term_id),
        grade: num(p.grade),
        status: num(p.status),
        card: p.card as unknown as ReviewCard,
        log: p.log as unknown as ReviewGradeRequest['log'],
      })
    );
  }
  m = path.match(/^\/languages\/(\d+)$/);
  if (m) {
    return wrap(await updateLanguage(num(m[1]), p as unknown as LanguageCreateRequest));
  }
  m = path.match(/^\/terms\/(\d+)$/);
  if (m) {
    return wrap(await updateFull(num(m[1]), p as unknown as TermUpdateFullRequest));
  }
  m = path.match(/^\/texts\/(\d+)$/);
  if (m) {
    // TextsApi.update sends camelCase; accept snake_case too, like POST /texts.
    const sourceUri = p.source_uri ?? p.sourceUri;
    const audioUri = p.audio_uri ?? p.audioUri;
    return wrap(
      await updateText(num(m[1]), {
        title: str(p.title),
        langId: num(p.language_id ?? p.langId),
        text: str(p.text),
        sourceUri: sourceUri != null ? str(sourceUri) : undefined,
        audioUri: audioUri != null ? str(audioUri) : undefined,
        tags: Array.isArray(p.tags) ? (p.tags as string[]) : undefined,
      })
    );
  }
  m = path.match(/^\/tags\/term\/(\d+)$/);
  if (m) {
    return wrap(await renameTermTag(num(m[1]), str(p.name)));
  }
  m = path.match(/^\/tags\/text\/(\d+)$/);
  if (m) {
    return wrap(await renameTextTag(num(m[1]), str(p.name)));
  }
  return NOT_HANDLED;
}

async function routeDelete(path: string): Promise<LocalRouteResult> {
  let m = path.match(/^\/terms\/(\d+)$/);
  if (m) {
    return wrap(await deleteTerm(num(m[1])));
  }
  m = path.match(/^\/texts\/(\d+)$/);
  if (m) {
    return wrap(await deleteText(num(m[1])));
  }
  m = path.match(/^\/languages\/(\d+)$/);
  if (m) {
    return wrap(await deleteLanguage(num(m[1])));
  }
  m = path.match(/^\/tags\/term\/(\d+)$/);
  if (m) {
    return wrap(await deleteTermTag(num(m[1])));
  }
  m = path.match(/^\/tags\/text\/(\d+)$/);
  if (m) {
    return wrap(await deleteTextTag(num(m[1])));
  }
  return NOT_HANDLED;
}

/**
 * Try to serve an API call from the local database. Returns `{ handled:false }`
 * when local-first mode is off or the endpoint is not owned locally, so the
 * caller falls back to the network.
 */
export async function routeLocal(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  payload: Payload
): Promise<LocalRouteResult> {
  if (!isLocalFirst()) {
    return NOT_HANDLED;
  }
  const path = endpoint.split('?')[0];
  const p = payload ?? {};
  try {
    switch (method) {
      case 'GET':
        return await routeGet(path, p);
      case 'POST':
        return await routePost(path, p);
      case 'PUT':
        return await routePut(path, p);
      case 'DELETE':
        return await routeDelete(path);
      default:
        return NOT_HANDLED;
    }
  } catch (error) {
    return { handled: true, error: String(error) };
  }
}
