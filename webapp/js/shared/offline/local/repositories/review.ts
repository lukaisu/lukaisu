/**
 * Review repository — offline spaced-repetition. Picks due words by their FSRS
 * `due` date and persists graded answers. The FSRS algorithm runs in the client
 * (`../fsrs.ts`); this repository selects/stores. `selection` is an internal
 * token produced by `getReviewConfig` and consumed by the other methods.
 *
 * @license Unlicense <http://unlicense.org/>
 */

import { localDb, type LocalLanguage, type LocalWord } from '../schema';
import { hasUsableTranslation, isLearningStatus, nextStatus } from '../review-scoring';
import { retrievability, type FsrsState, type FsrsLogEntry, type ReviewGrade } from '../fsrs';
import { applyStatus, persistGrade } from './helpers';
import { getCurrentLanguageId } from './settings';
import type {
  WordTestData,
  ReviewCard,
  TomorrowCountResponse,
  ReviewStatusResponse,
  ReviewGradeRequest,
  ReviewGradeResponse,
  ReviewConfigResponse,
  ReviewLangSettings,
  TableWordsResponse,
  TableReviewWord,
  NextWordParams,
} from '@modules/review/api/review_api';

const DAY_MS = 86_400_000;

/** Resolve the candidate words for a `selection` token (`lang:<id>` / `text:<id>`). */
async function candidateWords(selection: string): Promise<LocalWord[]> {
  const [kind, rawId] = selection.split(':');
  const id = parseInt(rawId ?? '', 10);

  if (kind === 'text' && !Number.isNaN(id)) {
    const occ = await localDb.occurrences.where('textId').equals(id).and((o) => o.woId != null).toArray();
    const ids = [...new Set(occ.map((o) => o.woId).filter((x): x is number => x != null))];
    const words: LocalWord[] = [];
    for (const w of await localDb.words.bulkGet(ids)) {
      if (w && w.deletedAt == null) {
        words.push(w);
      }
    }
    return words;
  }

  if (kind === 'lang' && !Number.isNaN(id)) {
    return localDb.words.where('langId').equals(id).and((w) => w.deletedAt == null).toArray();
  }

  return localDb.words.filter((w) => w.deletedAt == null).toArray();
}

/** Words currently reviewable (learning status + usable translation). */
function reviewable(words: LocalWord[]): LocalWord[] {
  return words.filter(
    (w) => isLearningStatus(w.status) && hasUsableTranslation(w.translation)
  );
}

/** Words due at `nowMs`, most overdue first (stable tiebreak by id). */
function dueWords(words: LocalWord[], nowMs: number): LocalWord[] {
  return reviewable(words)
    .filter((w) => w.due <= nowMs)
    .sort((a, b) => a.due - b.due || (a.id ?? 0) - (b.id ?? 0));
}

/** The FSRS card payload for a stored word. */
function cardOf(w: LocalWord): ReviewCard {
  return {
    stability: w.stability,
    difficulty: w.difficulty,
    due: w.due,
    lastReview: w.lastReview,
    reps: w.reps,
    lapses: w.lapses,
    state: w.fsrsState,
  };
}

function langSettings(l: LocalLanguage): ReviewLangSettings {
  return {
    name: l.name,
    dict1Uri: l.dict1Uri,
    dict2Uri: l.dict2Uri,
    translateUri: l.translatorUri,
    textSize: l.textSize,
    rtl: l.rightToLeft,
    langCode: l.code,
  };
}

/** Build a review session configuration for a language or text. */
export async function getReviewConfig(params: {
  lang?: number;
  text?: number;
  selection?: number;
}): Promise<ReviewConfigResponse | { error: string }> {
  let selection: string;
  let langId: number;

  if (params.text) {
    const text = await localDb.texts.get(params.text);
    if (!text) {
      return { error: 'Text not found' };
    }
    selection = `text:${params.text}`;
    langId = text.langId;
  } else {
    langId = params.lang || (await getCurrentLanguageId());
    selection = `lang:${langId}`;
  }

  const language = await localDb.languages.get(langId);
  if (!language) {
    return { error: 'Language not found' };
  }

  const due = dueWords(await candidateWords(selection), Date.now());
  const now = Date.now();
  return {
    reviewKey: 'local',
    selection,
    reviewType: 0,
    isTableMode: false,
    wordMode: true,
    langId,
    wordRegex: language.regexpWordCharacters,
    langSettings: langSettings(language),
    progress: { total: due.length, remaining: due.length, wrong: 0, correct: 0 },
    timer: { startTime: now, serverTime: now },
    title: language.name,
    property: '',
  };
}

/** The next word to review (with its FSRS card), or an empty record when done. */
export async function getNextWord(params: NextWordParams): Promise<WordTestData> {
  const due = dueWords(await candidateWords(params.selection), Date.now());
  const top = due[0];
  if (!top) {
    return { term_id: '', term_text: '', solution: '', group: '' };
  }
  return {
    term_id: top.id ?? 0,
    term_text: top.text,
    solution: top.translation,
    group: top.sentence,
    fsrs: cardOf(top),
  };
}

/** Count words that become due within the next day (excluding ones due now). */
export async function getTomorrowCount(
  _reviewKey: string,
  selection: string
): Promise<TomorrowCountResponse> {
  const now = Date.now();
  const count = reviewable(await candidateWords(selection)).filter(
    (w) => w.due > now && w.due <= now + DAY_MS
  ).length;
  return { count };
}

/** Apply a manual status change (start Learning / Well-known / Ignored). */
export async function updateStatus(
  termId: number,
  status?: number,
  change?: number
): Promise<ReviewStatusResponse> {
  const word = await localDb.words.get(termId);
  if (!word) {
    return { error: 'Term not found' };
  }
  let target: number;
  if (typeof status === 'number') {
    target = status;
  } else if (typeof change === 'number') {
    target = isLearningStatus(word.status)
      ? Math.max(1, Math.min(5, word.status + change))
      : nextStatus(word.status, change > 0);
  } else {
    target = word.status;
  }
  await applyStatus(termId, target);
  return { status: target, controls: '' };
}

/** Persist a graded review (the client computed the card via FSRS). */
export async function applyGrade(req: {
  term_id: number;
  grade: number;
  status: number;
  card: ReviewCard;
  log: ReviewGradeRequest['log'];
}): Promise<ReviewGradeResponse> {
  const card: FsrsState = {
    stability: req.card.stability,
    difficulty: req.card.difficulty,
    due: req.card.due,
    lastReview: req.card.lastReview,
    reps: req.card.reps,
    lapses: req.card.lapses,
    state: req.card.state,
  };
  const log: FsrsLogEntry = {
    grade: req.grade as ReviewGrade,
    state: req.log.state,
    stability: req.log.stability,
    difficulty: req.log.difficulty,
    elapsedDays: req.log.elapsedDays,
    scheduledDays: req.log.scheduledDays,
    reviewedAt: req.log.reviewedAt,
  };
  const result = await persistGrade(req.term_id, card, log);
  if (!result) {
    return { error: 'Term not found' };
  }
  return { status: result.status, due: result.due };
}

/** All reviewable words for table-mode review (score = recall probability %). */
export async function getTableWords(
  _reviewKey: string,
  selection: string
): Promise<TableWordsResponse | { error: string }> {
  const words = reviewable(await candidateWords(selection));
  const now = Date.now();
  const langId = words[0]?.langId ?? (await getCurrentLanguageId());
  const language = await localDb.languages.get(langId);

  const tableWords: TableReviewWord[] = words
    .slice()
    .sort((a, b) => a.due - b.due)
    .map((w) => ({
      id: w.id ?? 0,
      text: w.text,
      translation: w.translation,
      romanization: w.romanization,
      sentence: w.sentence,
      sentenceHtml: w.sentence,
      status: w.status,
      score: Math.round(retrievability(cardOf(w), now) * 100),
    }));

  return {
    words: tableWords,
    langSettings: language
      ? langSettings(language)
      : { name: '', dict1Uri: '', dict2Uri: '', translateUri: '', textSize: 100, rtl: false, langCode: '' },
  };
}
