/**
 * Local-first database schema (Dexie / IndexedDB).
 *
 * This mirrors the server's MySQL schema (`db/schema/baseline.sql`) closely
 * enough that the same rendering code can read it, but is single-user: the
 * `*user_id` ownership columns are dropped. Every row carries `createdAt` /
 * `updatedAt` (epoch ms) and a `deletedAt` tombstone so a sync layer can be
 * added later without a migration; a `pendingOps` queue is reserved for the
 * same purpose. Sync itself is out of scope for the offline milestone.
 *
 * This is the local-FIRST store (`LukaisuLocalDB`), distinct from the older
 * download-for-offline cache prototype in `../db.ts` (`LukaisuOfflineDB`).
 *
 * @license Unlicense <http://unlicense.org/>
 */

import Dexie, { type Table } from 'dexie';
import { seedFromStatus } from './fsrs';

/** Word status values (mirrors the server `status`). */
export const WordStatus = {
  /** Unknown — not stored as a row; rendered when an occurrence has no word. */
  UNKNOWN: 0,
  NEW: 1,
  LEARNING_2: 2,
  LEARNING_3: 3,
  LEARNING_4: 4,
  LEARNED: 5,
  IGNORED: 98,
  WELL_KNOWN: 99,
} as const;

/** A language and its parsing/display configuration (`Lg*`). */
export interface LocalLanguage {
  id?: number;
  name: string;
  /** Source language code being learned, e.g. `fr`. */
  code: string;
  dict1Uri: string;
  dict2Uri: string;
  translatorUri: string;
  exportTemplate: string;
  textSize: number;
  characterSubstitutions: string;
  regexpSplitSentences: string;
  exceptionsSplitSentences: string;
  regexpWordCharacters: string;
  removeSpaces: boolean;
  splitEachChar: boolean;
  rightToLeft: boolean;
  ttsVoiceApi: string;
  showRomanization: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** A text the user reads (`Tx*`). */
export interface LocalText {
  id?: number;
  langId: number;
  title: string;
  /** Raw source text (original, unsplit). */
  text: string;
  audioUri: string | null;
  sourceUri: string | null;
  /** Current reading position (occurrence order), 0 if unread. */
  position: number;
  audioPosition: number;
  /** Soft archive timestamp (epoch ms), null if active. */
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** A learned/known term (`Wo*`). */
export interface LocalWord {
  id?: number;
  langId: number;
  /** Original surface form (case preserved). */
  text: string;
  /** Lower-cased form; unique per language; used for matching occurrences. */
  textLc: string;
  lemma: string;
  lemmaLc: string;
  status: number;
  translation: string;
  romanization: string;
  /** Example sentence with the term marked as `{term}`. */
  sentence: string;
  notes: string;
  /** 0 = single word; >=1 = multi-word expression spanning N tokens. */
  wordCount: number;
  created: number;
  /** When `status` last changed (epoch ms). */
  statusChanged: number;
  /**
   * FSRS scheduling state (issue #238). Mirrors the `words` FSRS columns and
   * the persisted shape in `../fsrs.ts` ({@link import('../fsrs').FsrsState}).
   * The display `status` (1-5) is *derived* from `stability`; 98/99 are manual
   * flags and are not scheduled.
   */
  /** Memory stability in days. */
  stability: number;
  /** Item difficulty (~1-10). */
  difficulty: number;
  /** Next review due, epoch ms. */
  due: number;
  /** Last review, epoch ms, or null if never reviewed. */
  lastReview: number | null;
  /** Total reviews. */
  reps: number;
  /** Times forgotten (Again while in Review). */
  lapses: number;
  /** ts-fsrs state: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  fsrsState: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** A logged review (issue #238) — one row per graded answer, for stats/optimisation. */
export interface LocalReviewLog {
  id?: number;
  woId: number;
  /** 1=Again, 2=Hard, 3=Good, 4=Easy. */
  grade: number;
  /** Card state at review time. */
  fsrsState: number;
  /** Resulting stability. */
  stability: number;
  /** Resulting difficulty. */
  difficulty: number;
  /** Days since the previous review. */
  elapsedDays: number;
  /** Scheduled interval in days. */
  scheduledDays: number;
  /** When the review happened, epoch ms. */
  reviewedAt: number;
}

/** A sentence within a text (`Se*`). */
export interface LocalSentence {
  id?: number;
  langId: number;
  textId: number;
  /** 0-based sentence index within the text. */
  order: number;
  text: string;
  /** Occurrence order of the first token in this sentence. */
  firstPos: number;
}

/**
 * A text position mapped to a (possibly unknown) word (`Ti2*`).
 *
 * `woId` is null for unknown words and for non-word tokens. `isWord`
 * distinguishes learnable tokens from punctuation/whitespace.
 */
export interface LocalOccurrence {
  id?: number;
  textId: number;
  langId: number;
  sentenceId: number;
  /** 0-based position within the text (token order). */
  order: number;
  /** 0 = single token; >=1 = part of a multi-word expression. */
  wordCount: number;
  /** The token text as it appears in the source. */
  text: string;
  /** Lower-cased token text (for matching against words). */
  textLc: string;
  isWord: boolean;
  /** Linked word id, or null when unknown / non-word. */
  woId: number | null;
}

/** A vocabulary tag (`Tg*`). */
export interface LocalTag {
  id?: number;
  text: string;
  comment: string;
}

/** Word⇄tag mapping (`Wt*`). */
export interface LocalWordTag {
  id?: number;
  woId: number;
  tgId: number;
}

/** A text tag / category (`T2*`). */
export interface LocalTextTag {
  id?: number;
  text: string;
  comment: string;
}

/** Text⇄text-tag mapping (`Tt*`). */
export interface LocalTextTagMap {
  id?: number;
  txId: number;
  t2Id: number;
}

/** A single setting (`settings`), single-user so keyed by `key` alone. */
export interface LocalSetting {
  key: string;
  value: string;
}

/** A queued local mutation for a future sync layer. */
export interface LocalPendingOp {
  id?: number;
  type: string;
  entity: string;
  entityId: number;
  data: Record<string, unknown>;
  createdAt: number;
  retries: number;
}

/**
 * The local-first database. Index strings list only the indexed fields; other
 * fields are stored but not indexed.
 */
export class LukaisuLocalDatabase extends Dexie {
  languages!: Table<LocalLanguage, number>;
  texts!: Table<LocalText, number>;
  words!: Table<LocalWord, number>;
  sentences!: Table<LocalSentence, number>;
  occurrences!: Table<LocalOccurrence, number>;
  tags!: Table<LocalTag, number>;
  wordTags!: Table<LocalWordTag, number>;
  textTags!: Table<LocalTextTag, number>;
  textTagMap!: Table<LocalTextTagMap, number>;
  settings!: Table<LocalSetting, string>;
  pendingOps!: Table<LocalPendingOp, number>;
  reviewLog!: Table<LocalReviewLog, number>;

  constructor(name = 'LukaisuLocalDB') {
    super(name);
    this.version(1).stores({
      languages: '++id, name, code, deletedAt',
      texts: '++id, langId, archivedAt, deletedAt, updatedAt',
      words:
        '++id, langId, &[textLc+langId], status, todayScore, tomorrowScore, random, lemmaLc, deletedAt, updatedAt',
      sentences: '++id, textId, langId, [textId+order]',
      occurrences:
        '++id, textId, langId, sentenceId, [textId+order], [langId+textLc], woId, isWord',
      tags: '++id, &text',
      wordTags: '++id, woId, tgId, [woId+tgId]',
      textTags: '++id, &text',
      textTagMap: '++id, txId, t2Id, [txId+t2Id]',
      settings: 'key',
      pendingOps: '++id, entity, type, createdAt',
    });

    // v2 (issue #238): replace the Leitner score columns with FSRS state and add
    // the review log. Existing words are seeded from their status so the derived
    // display status (and reading colours) stay stable; the score fields are
    // dropped. Mirrors the server's add_fsrs_scheduling migration.
    this.version(2)
      .stores({
        words:
          '++id, langId, &[textLc+langId], status, due, lemmaLc, deletedAt, updatedAt',
        reviewLog: '++id, woId, reviewedAt',
      })
      .upgrade((tx) =>
        tx
          .table<LocalWord>('words')
          .toCollection()
          .modify((w) => {
            const legacy = w as LocalWord & Record<string, unknown>;
            const status = typeof w.status === 'number' ? w.status : 1;
            const changed =
              typeof w.statusChanged === 'number' ? w.statusChanged : w.created ?? 0;
            const seed =
              status >= 1 && status <= 5
                ? seedFromStatus(status, changed)
                : {
                    stability: 0,
                    difficulty: 0,
                    due: changed,
                    lastReview: null,
                    reps: 0,
                    lapses: 0,
                    state: 0,
                  };
            w.stability = seed.stability;
            w.difficulty = seed.difficulty;
            w.due = seed.due;
            w.lastReview = seed.lastReview;
            w.reps = seed.reps;
            w.lapses = seed.lapses;
            w.fsrsState = seed.state;
            delete legacy.todayScore;
            delete legacy.tomorrowScore;
            delete legacy.random;
          })
      );
  }
}

/** Singleton instance used by the repositories. */
export const localDb = new LukaisuLocalDatabase();

/** True if IndexedDB is usable in this environment. */
export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}
