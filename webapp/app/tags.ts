/**
 * "Tags" management page entry for the bundled client.
 *
 * Replaces the server-rendered tag list + form (`Modules/Tags/Views/tag_list.php`,
 * `tag_form.php`), whose legacy component (`tags/pages/tag_list.ts`) drives native
 * navigation + native POST bulk actions — neither works offline. This is a
 * purpose-built API-client page: it lists every term and text tag with usage
 * counts (`GET /tags/manage`) and renames (`PUT /tags/{term,text}/{id}`) or deletes
 * (`DELETE /tags/{term,text}/{id}`) them, all served on-device by the local-first
 * router. The offline E2E asserts `apiAttempts === 0`.
 *
 * Scope: rename + delete, the core management ops. Creating a *standalone* tag is
 * intentionally omitted — tags are created on demand when you tag a term or a text
 * (an orphan tag has no use), matching how the app already works. The tag mutation
 * arms are local-first only: the server exposes tag writes as web-route forms, not
 * `/api/v1` (PHP being frozen), so in server-backed mode the tag pages still reach
 * the server's own forms.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { bootAppPage, initDataMode } from './boot';
import { TagsApi } from '@modules/tags/api/tags_api';
import type { TagManageItem } from '@modules/tags/api/tags_api';

type TagKind = 'term' | 'text';

function el<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function notify(message: string, kind: 'is-success' | 'is-danger'): void {
  const notice = el<HTMLElement>('tg-notice');
  if (!notice) return;
  notice.textContent = message;
  notice.className = `notification ${kind}`;
  notice.style.display = '';
}

/** Rename via the API; returns true on success and surfaces errors otherwise. */
async function rename(kind: TagKind, id: number, name: string): Promise<boolean> {
  const res = kind === 'term'
    ? await TagsApi.renameTerm(id, name)
    : await TagsApi.renameText(id, name);
  if (res.error || !res.data || res.data.error || !res.data.success) {
    notify(res.data?.error || res.error || 'Could not rename the tag.', 'is-danger');
    return false;
  }
  notify(`Renamed to “${name}”.`, 'is-success');
  return true;
}

/** Delete via the API; returns true on success. */
async function remove(kind: TagKind, id: number): Promise<boolean> {
  const res = kind === 'term'
    ? await TagsApi.deleteTerm(id)
    : await TagsApi.deleteText(id);
  if (res.error || !res.data || res.data.error || !res.data.success) {
    notify(res.data?.error || res.error || 'Could not delete the tag.', 'is-danger');
    return false;
  }
  notify('Tag deleted.', 'is-success');
  return true;
}

/** Build one editable row: name input + use count + Save / Delete buttons. */
function buildRow(kind: TagKind, tag: TagManageItem): HTMLTableRowElement {
  const row = document.createElement('tr');

  const nameCell = document.createElement('td');
  const input = document.createElement('input');
  input.className = 'input is-small';
  input.type = 'text';
  input.value = tag.name;
  input.maxLength = 200;
  nameCell.appendChild(input);

  const countCell = document.createElement('td');
  countCell.textContent = String(tag.count);

  const actionCell = document.createElement('td');
  const save = document.createElement('button');
  save.className = 'button is-small is-primary';
  save.textContent = 'Save';
  const del = document.createElement('button');
  del.className = 'button is-small is-danger is-outlined ml-2';
  del.textContent = 'Delete';
  actionCell.appendChild(save);
  actionCell.appendChild(del);

  save.addEventListener('click', () => {
    const next = input.value.trim();
    if (next === '' || next === tag.name) return;
    save.classList.add('is-loading');
    void rename(kind, tag.id, next).then((ok) => {
      save.classList.remove('is-loading');
      if (ok) tag.name = next;
    });
  });

  del.addEventListener('click', () => {
    if (!confirm(`Delete the tag “${tag.name}”? It will be removed from every ${kind}.`)) {
      return;
    }
    del.classList.add('is-loading');
    void remove(kind, tag.id).then((ok) => {
      del.classList.remove('is-loading');
      if (ok) row.remove();
    });
  });

  row.appendChild(nameCell);
  row.appendChild(countCell);
  row.appendChild(actionCell);
  return row;
}

function renderGroup(kind: TagKind, tags: TagManageItem[]): void {
  const body = el<HTMLTableSectionElement>(`tg-${kind}-body`);
  const empty = el<HTMLElement>(`tg-${kind}-empty`);
  if (!body) return;
  body.replaceChildren();
  for (const tag of tags) {
    body.appendChild(buildRow(kind, tag));
  }
  if (empty) empty.style.display = tags.length === 0 ? '' : 'none';
}

async function start(): Promise<void> {
  // Local-first (seed on first run) before any API call, so this works offline.
  await initDataMode();

  const loading = el<HTMLElement>('tg-loading');
  const content = el<HTMLElement>('tg-content');

  const res = await TagsApi.listForManagement();
  if (res.error || !res.data) {
    notify(res.error || 'Could not load tags.', 'is-danger');
    if (loading) loading.style.display = 'none';
    await bootAppPage({ requireAuth: true });
    return;
  }

  renderGroup('term', res.data.term);
  renderGroup('text', res.data.text);

  if (loading) loading.style.display = 'none';
  if (content) content.style.display = '';

  await bootAppPage({ requireAuth: true });
}

void start();
