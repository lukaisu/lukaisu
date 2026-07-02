/**
 * "Local dictionaries" page entry for the bundled client — server-enhanced
 * (Job B, surface 3).
 *
 * Local dictionaries are stored and searched on a Lukaisu Server (the reader's
 * word-lookup consults `/api/v1/local-dictionaries/lookup`); there is no
 * on-device dictionary store, so this page is **gated**:
 *
 *   - **server-backed / same-origin** (a server is connected): manage the
 *     selected language's dictionaries (list + delete) and **one-click import**
 *     from the bundled curated registry (`POST /local-dictionaries/import-curated`
 *     — the server downloads + parses). Arbitrary CSV/JSON/StarDict *file* upload
 *     needs a server-side temp path the API can't take from a bearer client, so
 *     that links out to the server's own web import form (`/dictionaries/import`).
 *   - **local-first** (packaged app, no server): `#dicts-app` is removed and a
 *     "connect a server" notice is shown; the reader keeps its online-dictionary
 *     lookups offline.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { bootAppPage, initDataMode } from './boot';
import { pageUrl } from './router';
import { apiGet, apiPost, apiDelete } from '@shared/api/client';
import { LanguagesApi } from '@modules/language/api/languages_api';
import { CURATED_DICTIONARIES } from '@/dictionaries/curated_dictionaries';

interface DictRow {
  id: number;
  name: string;
  source_format: string;
  entry_count: number;
  enabled: boolean;
}

/** A flattened curated source, parallel to the <option> values (by index). */
interface FlatSource {
  name: string;
  url: string;
  format: string;
}

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

let currentLangId = 0;
let currentLangName = '';
const curatedFlat: FlatSource[] = [];

function showError(message: string): void {
  const box = el<HTMLElement>('dicts-error');
  const msg = el<HTMLElement>('dicts-error-msg');
  if (msg) msg.textContent = message;
  if (box) box.style.display = message ? '' : 'none';
}

function setCuratedStatus(message: string, isError = false): void {
  const status = el<HTMLElement>('dicts-curated-status');
  if (!status) return;
  status.textContent = message;
  status.classList.remove('has-text-danger', 'has-text-success');
  if (isError) status.classList.add('has-text-danger');
  else if (message) status.classList.add('has-text-success');
}

/** Render the dictionaries table (or the empty-state) for the current language. */
function renderDictionaries(rows: DictRow[]): void {
  const table = el<HTMLTableElement>('dicts-table');
  const tbody = el<HTMLElement>('dicts-tbody');
  const empty = el<HTMLElement>('dicts-empty');
  if (!table || !tbody || !empty) return;
  tbody.replaceChildren();

  if (rows.length === 0) {
    table.setAttribute('hidden', '');
    empty.removeAttribute('hidden');
    return;
  }
  empty.setAttribute('hidden', '');
  table.removeAttribute('hidden');

  for (const row of rows) {
    const tr = document.createElement('tr');

    const name = document.createElement('td');
    name.textContent = row.name;
    const fmt = document.createElement('td');
    fmt.textContent = row.source_format;
    const count = document.createElement('td');
    count.className = 'has-text-right';
    count.textContent = String(row.entry_count ?? 0);

    const status = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = row.enabled ? 'tag is-success is-light' : 'tag is-light';
    badge.textContent = row.enabled ? 'Enabled' : 'Disabled';
    status.appendChild(badge);

    const actions = document.createElement('td');
    actions.className = 'has-text-right';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'button is-small is-danger is-outlined';
    del.dataset.dictDel = String(row.id);
    del.dataset.dictName = row.name;
    del.textContent = 'Delete';
    actions.appendChild(del);

    tr.append(name, fmt, count, status, actions);
    tbody.appendChild(tr);
  }
}

async function loadDictionaries(langId: number): Promise<void> {
  showError('');
  const res = await apiGet<{ dictionaries: DictRow[]; mode: number }>(
    '/local-dictionaries',
    { language_id: langId }
  );
  if (res.error) {
    showError(res.error);
    renderDictionaries([]);
    return;
  }
  renderDictionaries(res.data?.dictionaries ?? []);
}

async function deleteDictionary(id: number, name: string): Promise<void> {
  if (!window.confirm(`Delete dictionary "${name}"? Its entries will be removed.`)) {
    return;
  }
  const res = await apiDelete<{ success?: boolean; error?: string }>(`/local-dictionaries/${id}`);
  if (res.error || res.data?.error || res.data?.success === false) {
    showError(res.error || res.data?.error || 'Could not delete the dictionary.');
    return;
  }
  await loadDictionaries(currentLangId);
}

async function importCurated(): Promise<void> {
  const select = el<HTMLSelectElement>('dicts-curated-select');
  const button = el<HTMLButtonElement>('dicts-curated-import');
  const source = curatedFlat[Number(select?.value)];
  if (!source) {
    setCuratedStatus('Choose a dictionary to import.', true);
    return;
  }
  button?.classList.add('is-loading');
  setCuratedStatus(`Importing "${source.name}" — the server is downloading it…`);
  const res = await apiPost<{ success?: boolean; imported?: number; error?: string }>(
    '/local-dictionaries/import-curated',
    { language_id: currentLangId, url: source.url, format: source.format, name: source.name }
  );
  button?.classList.remove('is-loading');
  if (res.error || res.data?.error || res.data?.success === false) {
    setCuratedStatus(res.error || res.data?.error || 'Import failed.', true);
    return;
  }
  setCuratedStatus(`Imported "${source.name}" (${res.data?.imported ?? 0} entries).`);
  await loadDictionaries(currentLangId);
}

/** Build the curated <optgroup>s and the parallel flat-index lookup. */
function buildCuratedOptions(): void {
  const select = el<HTMLSelectElement>('dicts-curated-select');
  if (!select) return;
  select.replaceChildren();
  curatedFlat.length = 0;
  for (const group of CURATED_DICTIONARIES) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.languageName;
    for (const src of group.sources) {
      const option = document.createElement('option');
      option.value = String(curatedFlat.length);
      option.textContent = src.entries ? `${src.name} (${src.entries})` : src.name;
      optgroup.appendChild(option);
      curatedFlat.push({ name: src.name, url: src.url, format: src.format });
    }
    select.appendChild(optgroup);
  }
}

/** Pre-select the first curated source whose language matches the current one. */
function selectCuratedForLanguage(): void {
  const select = el<HTMLSelectElement>('dicts-curated-select');
  if (!select) return;
  let index = 0;
  for (const group of CURATED_DICTIONARIES) {
    if (group.languageName.toLowerCase() === currentLangName.toLowerCase()) {
      select.value = String(index);
      return;
    }
    index += group.sources.length;
  }
}

/** Point the "import a file" link at the connected server's web import form. */
function updateFileLink(): void {
  const link = el<HTMLAnchorElement>('dicts-file-link');
  if (link) link.setAttribute('href', `/dictionaries/import?lang=${currentLangId}`);
}

function onLanguageChange(langId: number, langName: string): void {
  currentLangId = langId;
  currentLangName = langName;
  selectCuratedForLanguage();
  updateFileLink();
  void loadDictionaries(langId);
}

async function start(): Promise<void> {
  const localFirst = await initDataMode();

  if (localFirst) {
    // No server: drop the management UI and offer the connect flow instead.
    el<HTMLElement>('dicts-app')?.remove();
    el<HTMLElement>('dicts-offline')?.removeAttribute('hidden');
    el<HTMLButtonElement>('dicts-connect')?.addEventListener('click', () => {
      window.location.assign(pageUrl.connectChooser());
    });
    await bootAppPage({ requireAuth: true });
    return;
  }

  // Connected: populate the language picker (default to ?lang or the current
  // language), build the curated list, and load the first language's dictionaries.
  const res = await LanguagesApi.list();
  const languages = res.data?.languages ?? [];
  const urlLang = Number(new URLSearchParams(window.location.search).get('lang')) || 0;
  const defaultLang = urlLang || res.data?.currentLanguageId || languages[0]?.id || 0;

  const langSelect = el<HTMLSelectElement>('dicts-lang');
  if (langSelect) {
    for (const lang of languages) {
      const option = document.createElement('option');
      option.value = String(lang.id);
      option.textContent = lang.name;
      option.selected = lang.id === defaultLang;
      langSelect.appendChild(option);
    }
    langSelect.addEventListener('change', () => {
      const id = Number(langSelect.value);
      const name = langSelect.selectedOptions[0]?.textContent ?? '';
      onLanguageChange(id, name);
    });
  }

  buildCuratedOptions();
  el<HTMLButtonElement>('dicts-curated-import')?.addEventListener('click', () => void importCurated());
  el<HTMLElement>('dicts-tbody')?.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-dict-del]');
    if (btn) void deleteDictionary(Number(btn.dataset.dictDel), btn.dataset.dictName ?? '');
  });

  const chosen = languages.find((l) => l.id === defaultLang);
  currentLangId = defaultLang;
  currentLangName = chosen?.name ?? '';
  selectCuratedForLanguage();
  updateFileLink();

  el<HTMLElement>('dicts-loading')?.setAttribute('hidden', '');
  el<HTMLElement>('dicts-main')?.removeAttribute('hidden');

  if (defaultLang > 0) {
    await loadDictionaries(defaultLang);
  }

  await bootAppPage({ requireAuth: true });
}

void start();
