/**
 * Word Form Store (Svelte 5 runes) — port of the Alpine `createWordFormStore()`.
 *
 * Re-expresses the term edit-form state (form data, validation, dirty
 * detection, similar terms, tag list, save) with Svelte 5 runes so
 * `WordEditForm.svelte` can drive it directly. It reuses the same `TermsApi`
 * client, so behaviour is unchanged; only the reactivity substrate is Svelte.
 *
 * The Alpine store stays in place as the PWA renderer (it still has tests); the
 * two coexist until the PWA retires.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import {
  TermsApi,
  type SimilarTermForEdit,
  type TermCreateFullRequest,
  type TermUpdateFullRequest
} from '@modules/vocabulary/api/terms_api';
/**
 * Form data for the single-word editor. Ported from the retired Alpine
 * `word_form_store.ts` (deleted under R6e); canonical here now.
 */
export interface WordFormData {
  text: string;
  textLc: string;
  lemma: string;
  translation: string;
  romanization: string;
  sentence: string;
  notes: string;
  status: number;
  tags: string[];
}

/** Validation errors keyed by field name. */
export interface ValidationErrors {
  lemma: string | null;
  translation: string | null;
  romanization: string | null;
  sentence: string | null;
  notes: string | null;
  general: string | null;
}

/** Result of a save operation. */
export interface SaveResult {
  success: boolean;
  hex?: string;
  wordId?: number;
  error?: string;
}

/** Create initial empty form data. */
function createEmptyFormData(): WordFormData {
  return {
    text: '',
    textLc: '',
    lemma: '',
    translation: '',
    romanization: '',
    sentence: '',
    notes: '',
    status: 1,
    tags: []
  };
}

/** Create initial validation errors (all null = no errors). */
function createEmptyErrors(): ValidationErrors {
  return {
    lemma: null,
    translation: null,
    romanization: null,
    sentence: null,
    notes: null,
    general: null
  };
}

/** Deep clone form data for dirty detection. */
function cloneFormData(data: WordFormData): WordFormData {
  return { ...data, tags: [...data.tags] };
}

/** Check if two arrays have the same elements (order-insensitive). */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

/**
 * Term edit-form state + behaviour, ported from the Alpine store to Svelte 5
 * runes.
 */
export class WordFormStore {
  // Form data
  formData = $state<WordFormData>(createEmptyFormData());
  originalData = $state<WordFormData | null>(null);

  // Context
  wordId = $state<number | null>(null);
  textId = $state(0);
  position = $state(0);
  hex = $state('');
  isNewWord = $state(true);

  // Language settings
  showRomanization = $state(false);
  allTags = $state<string[]>([]);
  similarTerms = $state<SimilarTermForEdit[]>([]);

  // UI state
  isVisible = $state(false);
  isSubmitting = $state(false);
  isLoading = $state(false);
  shouldCloseModal = $state(false);
  shouldReturnToInfo = $state(false);

  // Validation
  errors = $state<ValidationErrors>(createEmptyErrors());

  /** Check if form has unsaved changes. */
  get isDirty(): boolean {
    if (!this.originalData) return false;
    return (
      this.formData.lemma !== this.originalData.lemma ||
      this.formData.translation !== this.originalData.translation ||
      this.formData.romanization !== this.originalData.romanization ||
      this.formData.sentence !== this.originalData.sentence ||
      this.formData.notes !== this.originalData.notes ||
      this.formData.status !== this.originalData.status ||
      !arraysEqual(this.formData.tags, this.originalData.tags)
    );
  }

  /** Check if form is valid (no validation errors). */
  get isValid(): boolean {
    return (
      this.errors.lemma === null &&
      this.errors.translation === null &&
      this.errors.romanization === null &&
      this.errors.sentence === null &&
      this.errors.notes === null &&
      this.errors.general === null
    );
  }

  /** Check if form can be submitted. */
  get canSubmit(): boolean {
    return this.isValid && !this.isSubmitting && !this.isLoading;
  }

  /** Load term data for editing. */
  async loadForEdit(textId: number, position: number, wordId?: number): Promise<void> {
    this.isLoading = true;
    this.errors = createEmptyErrors();

    try {
      const response = await TermsApi.getForEdit(textId, position, wordId);

      if (response.error || !response.data) {
        this.errors.general = response.error || 'Failed to load term data';
        this.isLoading = false;
        return;
      }

      const data = response.data;

      if (data.error) {
        this.errors.general = data.error;
        this.isLoading = false;
        return;
      }

      // Set context
      this.textId = textId;
      this.position = position;
      this.wordId = data.term.id;
      this.hex = data.term.hex;
      this.isNewWord = data.isNew;

      // Set language settings
      this.showRomanization = data.language.showRomanization;
      this.allTags = data.allTags;
      this.similarTerms = data.similarTerms;

      // Set form data
      this.formData = {
        text: data.term.text,
        textLc: data.term.textLc,
        lemma: data.term.lemma || '',
        translation: data.term.translation === '*' ? '' : data.term.translation,
        romanization: data.term.romanization,
        sentence: data.term.sentence,
        notes: data.term.notes || '',
        status: data.term.status,
        tags: [...data.term.tags]
      };

      // Store original for dirty detection
      this.originalData = cloneFormData(this.formData);

      this.isVisible = true;
    } catch (error) {
      console.error('Error loading term for edit:', error);
      this.errors.general = 'Failed to load term data';
    }

    this.isLoading = false;
  }

  /** Reset the form to initial state. */
  reset(): void {
    this.formData = createEmptyFormData();
    this.originalData = null;
    this.wordId = null;
    this.textId = 0;
    this.position = 0;
    this.hex = '';
    this.isNewWord = true;
    this.showRomanization = false;
    this.allTags = [];
    this.similarTerms = [];
    this.isVisible = false;
    this.isSubmitting = false;
    this.isLoading = false;
    this.shouldCloseModal = false;
    this.shouldReturnToInfo = false;
    this.errors = createEmptyErrors();
  }

  /** Validate all form fields. */
  validate(): boolean {
    this.validateField('lemma');
    this.validateField('translation');
    this.validateField('romanization');
    this.validateField('sentence');
    this.validateField('notes');
    return this.isValid;
  }

  /** Validate a single form field. */
  validateField(field: keyof WordFormData): void {
    switch (field) {
      case 'lemma':
        this.errors.lemma =
          this.formData.lemma.length > 250 ? 'Lemma must be 250 characters or less' : null;
        break;
      case 'translation':
        this.errors.translation =
          this.formData.translation.length > 500
            ? 'Translation must be 500 characters or less'
            : null;
        break;
      case 'romanization':
        this.errors.romanization =
          this.formData.romanization.length > 100
            ? 'Romanization must be 100 characters or less'
            : null;
        break;
      case 'sentence':
        this.errors.sentence =
          this.formData.sentence.length > 1000 ? 'Sentence must be 1000 characters or less' : null;
        break;
      case 'notes':
        this.errors.notes =
          this.formData.notes.length > 1000 ? 'Notes must be 1000 characters or less' : null;
        break;
    }
  }

  /** Save the form (create or update term). */
  async save(): Promise<SaveResult> {
    if (!this.validate()) {
      return { success: false, error: 'Please fix validation errors' };
    }

    this.isSubmitting = true;
    this.errors.general = null;

    try {
      let response;

      if (this.isNewWord) {
        const createData: TermCreateFullRequest = {
          textId: this.textId,
          position: this.position,
          translation: this.formData.translation,
          romanization: this.formData.romanization,
          sentence: this.formData.sentence,
          notes: this.formData.notes,
          lemma: this.formData.lemma || undefined,
          status: this.formData.status,
          tags: this.formData.tags
        };

        response = await TermsApi.createFull(createData);
      } else {
        if (this.wordId === null) {
          this.isSubmitting = false;
          return { success: false, error: 'Word ID is missing' };
        }

        const updateData: TermUpdateFullRequest = {
          translation: this.formData.translation,
          romanization: this.formData.romanization,
          sentence: this.formData.sentence,
          notes: this.formData.notes,
          lemma: this.formData.lemma || undefined,
          status: this.formData.status,
          tags: this.formData.tags
        };

        response = await TermsApi.updateFull(this.wordId, updateData);
      }

      if (response.error || !response.data) {
        this.errors.general = response.error || 'Failed to save term';
        this.isSubmitting = false;
        return { success: false, error: this.errors.general };
      }

      if (response.data.error) {
        this.errors.general = response.data.error;
        this.isSubmitting = false;
        return { success: false, error: response.data.error };
      }

      if (!response.data.term) {
        this.errors.general = 'No term data returned';
        this.isSubmitting = false;
        return { success: false, error: this.errors.general };
      }

      // Update context with returned data
      this.wordId = response.data.term.id;
      this.hex = response.data.term.hex;
      this.isNewWord = false;

      // Update original data for dirty detection
      this.originalData = cloneFormData(this.formData);

      this.isSubmitting = false;

      return {
        success: true,
        hex: response.data.term.hex,
        wordId: response.data.term.id
      };
    } catch (error) {
      console.error('Error saving term:', error);
      this.errors.general = 'Failed to save term';
      this.isSubmitting = false;
      return { success: false, error: this.errors.general };
    }
  }

  /** Copy translation from a similar term. */
  copyTranslationFromSimilar(translation: string): void {
    if (this.formData.translation) {
      this.formData.translation += '; ' + translation;
    } else {
      this.formData.translation = translation;
    }
    this.validateField('translation');
  }
}
