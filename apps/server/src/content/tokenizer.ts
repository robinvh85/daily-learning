/**
 * Lesson tokenizer (plan 2.5). Pure functions, no I/O.
 *
 * Rules:
 *  - A word is a run of letters, optionally joined by an apostrophe (`'` or `’`) or a hyphen:
 *    `I'm`, `it’s`, `There's`, `well-known`. Surrounding quotes and punctuation are not part of it.
 *  - Anything containing a digit (`4`, `10:15`, `2nd`) is skipped automatically.
 *  - Matching is case-insensitive and treats `’`/`‘` as `'`.
 *  - Multi-word entries (dictionary phrases, multi-word `ignore` items) are matched longest first.
 *    The words of a phrase must be separated by whitespace only (no punctuation in between).
 *  - `ignore` wins over the dictionary for the same span.
 *  - Contractions are dictionary entries of their own (`it's`, `I'll`) or forms of an entry
 *    (`there's` → `there is`). They are never split into two words.
 *  - Possessive fallback: `Lan's` / `shop’s` is looked up as `Lan` / `shop` if the full form is unknown.
 *  - Senses: `senses: { run: manage, "run#2": move }`. The word part may be the lemma or any form;
 *    `#n` is the n-th occurrence of that lemma in the whole lesson (1-based). Without a choice the
 *    first sense is used, and a warning is reported if the entry has more than one sense.
 */
import { SENSE_REF_PATTERN } from '@daily-learning/shared/content';

/** Lowercase and use a straight apostrophe. Used for every lookup key. */
export function normalizeWord(s: string): string {
  return s.replace(/[’‘]/g, "'").toLowerCase();
}

/** A dictionary entry as the tokenizer needs it. */
export interface LookupEntry {
  lemma: string;
  forms: readonly string[];
  senses: readonly { key: string }[];
}

export interface DictionaryLookup {
  /** Normalized form (words joined by one space) → lemma key (normalized lemma). */
  forms: ReadonlyMap<string, string>;
  /** Lemma key → sense keys in order (the first one is the default). */
  senses: ReadonlyMap<string, readonly string[]>;
  /** Longest form in words. */
  maxWords: number;
}

/**
 * Build the lookup tables. Every form (and the lemma itself) must map to exactly one entry;
 * conflicts are returned as errors and the first entry wins.
 */
export function buildLookup(entries: readonly LookupEntry[]): {
  lookup: DictionaryLookup;
  errors: string[];
} {
  const forms = new Map<string, string>();
  const senses = new Map<string, readonly string[]>();
  const errors: string[] = [];
  let maxWords = 1;
  for (const entry of entries) {
    const key = normalizeWord(entry.lemma);
    if (senses.has(key)) {
      errors.push(`duplicate dictionary entry "${entry.lemma}" (lemmas are case-insensitive)`);
      continue;
    }
    senses.set(
      key,
      entry.senses.map((s) => s.key),
    );
    for (const form of [entry.lemma, ...entry.forms]) {
      const f = normalizeWord(form).split(/\s+/).join(' ');
      const owner = forms.get(f);
      if (owner !== undefined && owner !== key) {
        errors.push(`form "${form}" of "${entry.lemma}" is already a form of "${owner}"`);
        continue;
      }
      forms.set(f, key);
      maxWords = Math.max(maxWords, f.split(' ').length);
    }
  }
  return { lookup: { forms, senses, maxWords }, errors };
}

export interface RawWord {
  /** Text as written in the segment. */
  text: string;
  /** Normalized lookup key. */
  norm: string;
  /** UTF-16 offsets in the segment text, end exclusive. */
  start: number;
  end: number;
}

const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’‘-][\p{L}\p{M}\p{N}]+)*/gu;
const HAS_DIGIT = /\p{N}/u;

/** Split a segment into words with offsets. Numbers and times (`4`, `10:15`) are skipped. */
export function splitWords(text: string): RawWord[] {
  const out: RawWord[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    if (HAS_DIGIT.test(m[0])) continue;
    const start = m.index;
    out.push({ text: m[0], norm: normalizeWord(m[0]), start, end: start + m[0].length });
  }
  return out;
}

export interface LessonToken {
  /** Position of the token inside its segment (0-based). */
  idx: number;
  surface: string;
  start: number;
  end: number;
  /** Lemma key (normalized lemma). */
  lemma: string;
  /** Chosen sense key (the first sense when the lesson does not choose one). */
  sense: string;
  /** Occurrence number of this lemma in the lesson (1-based). */
  occurrence: number;
}

export interface MissingWord {
  segment: number;
  surface: string;
  start: number;
}

export interface TokenizeResult {
  /** Tokens per segment, in order. */
  tokens: LessonToken[][];
  /** Words that are neither in the dictionary nor in `ignore`. */
  missing: MissingWord[];
  /** Invalid `senses` entries. */
  errors: string[];
  /** Multi-sense words without a choice, unused `ignore` items. */
  warnings: string[];
  /** Lemma keys with more than one sense and no choice in the lesson. */
  ambiguous: string[];
}

export interface TokenizeOptions {
  lookup: DictionaryLookup;
  ignore?: readonly string[];
  senses?: Readonly<Record<string, string>>;
}

interface Match {
  kind: 'word' | 'ignore';
  lemma?: string;
  first: number;
  count: number;
}

function phraseKey(
  ws: readonly RawWord[],
  from: number,
  count: number,
  text: string,
): string | null {
  const parts = [ws[from]!.norm];
  for (let j = from + 1; j < from + count; j++) {
    const gap = text.slice(ws[j - 1]!.end, ws[j]!.start);
    if (!/^\s+$/.test(gap)) return null;
    parts.push(ws[j]!.norm);
  }
  return parts.join(' ');
}

/** Tokenize all segments of one lesson and resolve lemmas and senses. */
export function tokenizeLesson(
  segmentTexts: readonly string[],
  options: TokenizeOptions,
): TokenizeResult {
  const { lookup } = options;
  const errors: string[] = [];
  const warnings: string[] = [];
  const missing: MissingWord[] = [];
  const ambiguous: string[] = [];

  const ignore = new Map<string, string>();
  for (const item of options.ignore ?? [])
    ignore.set(normalizeWord(item.trim()).split(/\s+/).join(' '), item);
  const usedIgnore = new Set<string>();
  const maxWords = Math.max(lookup.maxWords, ...[...ignore.keys()].map((k) => k.split(' ').length));

  // 1. Match words and phrases, longest first.
  const matched: { lemma: string; surface: string; start: number; end: number }[][] = [];
  segmentTexts.forEach((text, segIdx) => {
    const ws = splitWords(text);
    const segTokens: { lemma: string; surface: string; start: number; end: number }[] = [];
    let i = 0;
    while (i < ws.length) {
      let m: Match | null = null;
      for (let n = Math.min(maxWords, ws.length - i); n >= 1 && !m; n--) {
        const key = phraseKey(ws, i, n, text);
        if (key === null) continue;
        if (ignore.has(key)) {
          usedIgnore.add(key);
          m = { kind: 'ignore', first: i, count: n };
        } else if (lookup.forms.has(key)) {
          m = { kind: 'word', lemma: lookup.forms.get(key)!, first: i, count: n };
        }
      }
      // Possessive fallback for single words: `Lan's`, `shop’s`.
      if (!m && /'s$/.test(ws[i]!.norm)) {
        const base = ws[i]!.norm.slice(0, -2);
        if (ignore.has(base)) {
          usedIgnore.add(base);
          m = { kind: 'ignore', first: i, count: 1 };
        } else if (lookup.forms.has(base)) {
          m = { kind: 'word', lemma: lookup.forms.get(base)!, first: i, count: 1 };
        }
      }
      if (!m) {
        missing.push({ segment: segIdx, surface: ws[i]!.text, start: ws[i]!.start });
        i++;
        continue;
      }
      if (m.kind === 'word') {
        const start = ws[m.first]!.start;
        const end = ws[m.first + m.count - 1]!.end;
        segTokens.push({ lemma: m.lemma!, surface: text.slice(start, end), start, end });
      }
      i += m.count;
    }
    matched.push(segTokens);
  });

  // 2. Parse the lesson's sense choices.
  const lemmaChoice = new Map<string, string>();
  const occurrenceChoice = new Map<string, { sense: string; ref: string }>();
  const declared = new Map<string, string>(); // lemma → first ref, for "not in lesson" errors
  for (const [ref, sense] of Object.entries(options.senses ?? {})) {
    const m = SENSE_REF_PATTERN.exec(ref);
    if (!m) {
      errors.push(`senses: invalid key "${ref}" (use "word" or "word#n")`);
      continue;
    }
    const word = normalizeWord(m[1]!).split(/\s+/).join(' ');
    const lemma = lookup.forms.get(word);
    if (lemma === undefined) {
      errors.push(`senses: "${ref}" is not in the dictionary`);
      continue;
    }
    const available = lookup.senses.get(lemma) ?? [];
    if (!available.includes(sense)) {
      errors.push(
        `senses: "${ref}" → "${sense}" is not a sense of "${lemma}" (available: ${available.join(', ')})`,
      );
      continue;
    }
    if (!declared.has(lemma)) declared.set(lemma, ref);
    if (m[2] === undefined) lemmaChoice.set(lemma, sense);
    else occurrenceChoice.set(`${lemma}#${m[2]}`, { sense, ref });
  }

  // 3. Assign occurrences and senses.
  const counts = new Map<string, number>();
  const tokens = matched.map((segTokens) =>
    segTokens.map((t, idx): LessonToken => {
      const occurrence = (counts.get(t.lemma) ?? 0) + 1;
      counts.set(t.lemma, occurrence);
      const sense =
        occurrenceChoice.get(`${t.lemma}#${occurrence}`)?.sense ??
        lemmaChoice.get(t.lemma) ??
        lookup.senses.get(t.lemma)?.[0] ??
        '';
      return {
        idx,
        surface: t.surface,
        start: t.start,
        end: t.end,
        lemma: t.lemma,
        sense,
        occurrence,
      };
    }),
  );

  // 4. Report problems.
  for (const [lemma, ref] of declared) {
    if (!counts.has(lemma)) errors.push(`senses: "${ref}" does not appear in this lesson`);
  }
  for (const [key, { ref }] of occurrenceChoice) {
    const [lemma, n] = key.split('#') as [string, string];
    const count = counts.get(lemma) ?? 0;
    if (count > 0 && Number(n) > count) {
      errors.push(`senses: "${ref}" but "${lemma}" appears only ${count} time(s) in this lesson`);
    }
  }
  for (const [lemma] of counts) {
    const available = lookup.senses.get(lemma) ?? [];
    if (available.length > 1 && !declared.has(lemma)) {
      ambiguous.push(lemma);
      warnings.push(
        `"${lemma}" has ${available.length} senses but the lesson does not choose one; using "${available[0]}"`,
      );
    }
  }
  for (const [key, item] of ignore) {
    // Items with digits (`10:15`) are allowed for readability but numbers are skipped anyway.
    if (!usedIgnore.has(key) && !HAS_DIGIT.test(key))
      warnings.push(`ignore: "${item}" does not appear in this lesson`);
  }

  return { tokens, missing, errors, warnings, ambiguous };
}
