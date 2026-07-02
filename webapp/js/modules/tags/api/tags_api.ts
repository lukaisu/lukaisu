/**
 * Tags API — type-safe wrapper for tag management operations.
 *
 * The management arms (`GET /tags/manage`, `PUT`/`DELETE /tags/{term,text}/{id}`)
 * power the bundled `tags.html` page. They are served both on-device (the
 * local-first router, from IndexedDB) and server-backed (the matching `/api/v1`
 * endpoints, added with the PHP-view cut-over so the page also works against a
 * connected server). The read-only autocomplete/filter lists stay at `GET /tags`,
 * `/tags/term`, `/tags/text`.
 *
 * The create/edit arms (`POST /tags/{term,text}`, `GET`/`PUT
 * /tags/{term,text}/{id}` with a comment) back the bundled `tag-form.html`
 * island. They are server-only (the tag-form page is gated to a connected
 * server), so they have no local-first router counterpart.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { apiGet, apiPost, apiPut, apiDelete, type ApiResponse } from '@shared/api/client';

/** One tag in the management list (term or text), with its usage count. */
export interface TagManageItem {
  id: number;
  name: string;
  /** How many terms (or texts) currently carry this tag. */
  count: number;
}

/** Response for GET /tags/manage. */
export interface TagsManageResponse {
  term: TagManageItem[];
  text: TagManageItem[];
}

/** Response for a tag rename/update/delete. */
export interface TagMutationResponse {
  success?: boolean;
  error?: string;
}

/** Response for a tag create — the new tag's id on success. */
export interface TagCreateResponse {
  success?: boolean;
  id?: number;
  error?: string;
}

/** One tag with its comment, from `GET /tags/{term,text}/{id}` (edit form). */
export interface TagDetail {
  id: number;
  text: string;
  comment: string;
}

/**
 * Tags API methods (management surface — see the module note on availability).
 */
export const TagsApi = {
  /** List every term + text tag with usage counts. */
  async listForManagement(): Promise<ApiResponse<TagsManageResponse>> {
    return apiGet<TagsManageResponse>('/tags/manage');
  },

  /** Rename a term tag. */
  async renameTerm(id: number, name: string): Promise<ApiResponse<TagMutationResponse>> {
    return apiPut<TagMutationResponse>(`/tags/term/${id}`, { name });
  },

  /** Delete a term tag and unassign it from every term. */
  async deleteTerm(id: number): Promise<ApiResponse<TagMutationResponse>> {
    return apiDelete<TagMutationResponse>(`/tags/term/${id}`);
  },

  /** Rename a text tag. */
  async renameText(id: number, name: string): Promise<ApiResponse<TagMutationResponse>> {
    return apiPut<TagMutationResponse>(`/tags/text/${id}`, { name });
  },

  /** Delete a text tag and unassign it from every text. */
  async deleteText(id: number): Promise<ApiResponse<TagMutationResponse>> {
    return apiDelete<TagMutationResponse>(`/tags/text/${id}`);
  },

  // --- Create/edit arms (tag-form.html island; server-only) ---------------

  /** Load one term tag (name + comment) for the edit form. */
  async getTerm(id: number): Promise<ApiResponse<TagDetail>> {
    return apiGet<TagDetail>(`/tags/term/${id}`);
  },

  /** Load one text tag (name + comment) for the edit form. */
  async getText(id: number): Promise<ApiResponse<TagDetail>> {
    return apiGet<TagDetail>(`/tags/text/${id}`);
  },

  /** Create a term tag with a name and optional comment. */
  async createTerm(name: string, comment: string): Promise<ApiResponse<TagCreateResponse>> {
    return apiPost<TagCreateResponse>('/tags/term', { name, comment });
  },

  /** Create a text tag with a name and optional comment. */
  async createText(name: string, comment: string): Promise<ApiResponse<TagCreateResponse>> {
    return apiPost<TagCreateResponse>('/tags/text', { name, comment });
  },

  /** Update a term tag's name and comment. */
  async updateTerm(
    id: number,
    name: string,
    comment: string
  ): Promise<ApiResponse<TagMutationResponse>> {
    return apiPut<TagMutationResponse>(`/tags/term/${id}`, { name, comment });
  },

  /** Update a text tag's name and comment. */
  async updateText(
    id: number,
    name: string,
    comment: string
  ): Promise<ApiResponse<TagMutationResponse>> {
    return apiPut<TagMutationResponse>(`/tags/text/${id}`, { name, comment });
  }
};
