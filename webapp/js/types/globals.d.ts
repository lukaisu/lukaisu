/**
 * Type declarations for PHP-injected global variables
 *
 * These types describe the global variables that are injected into
 * the page by PHP scripts before the JavaScript bundle loads.
 */

export interface WordStatus {
  name: string;
  abbr: string;
  score?: number;
  color?: string;
}

export interface LukaisuLanguage {
  id: number;
  name?: string;
  abbreviation?: string;
  dict_link1: string;
  dict_link2: string;
  translator_link: string;
  delimiter: string;
  word_parsing: number | string;
  rtl: boolean;
  ttsVoiceApi: string;
  reading_mode?: 'direct' | 'internal' | 'external';
  voiceapi?: string;
}

export interface LukaisuText {
  id: number;
  reading_position: number;
  annotations: Record<string, [unknown, string, string]> | number;
}

export interface LukaisuWord {
  id: number;
}

export interface LukaisuReview {
  solution: string;
  answer_opened: boolean;
}

export interface LukaisuSettings {
  hts: number;
  word_status_filter: string;
  annotations_mode?: number;
}

export interface LukaisuData {
  language: LukaisuLanguage;
  text: LukaisuText;
  word: LukaisuWord;
  review: LukaisuReview;
  settings: LukaisuSettings;
}

export interface WordCounts {
  expr: Record<string, number>;
  expru: Record<string, number>;
  total: Record<string, number>;
  totalu: Record<string, number>;
  stat: Record<string, Record<string, number>>;
  statu: Record<string, Record<string, number>>;
}

declare global {
  interface Window {
    // LUKAISU_VITE_LOADED is set when the Vite bundle has finished loading
    LUKAISU_VITE_LOADED?: boolean;
  }
}
