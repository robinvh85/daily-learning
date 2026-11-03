/**
 * Read-only lesson content: the JSON files made by `npm run content:build`
 * (`@daily-learning/shared/content-data`), loaded once and indexed in memory.
 */
import type { SenseDto } from '@daily-learning/shared/api';
import {
  CONTENT_DATA_PREFIX,
  type CatalogLesson,
  type CatalogWord,
  type ContentCatalog,
  type ExamplesData,
  type LessonData,
} from '@daily-learning/shared/content-data';

/** Where the JSON comes from: `fetch` in the browser, built in memory in tests. */
export interface ContentSource {
  catalog(): Promise<ContentCatalog>;
  /** Null when the lesson file does not exist. */
  lesson(slug: string): Promise<LessonData | null>;
  examples(): Promise<ExamplesData>;
}

async function getJson<T>(path: string): Promise<T | null> {
  // `no-cache`: revalidate (ETag) so a new deploy is picked up on the next load.
  const res = await fetch(`${CONTENT_DATA_PREFIX}/${path}`, { cache: 'no-cache' });
  if (res.status === 404) return null;
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('json')) {
    throw new Error(`Không tải được nội dung bài học (${path}, HTTP ${res.status})`);
  }
  return (await res.json()) as T;
}

export const httpContentSource: ContentSource = {
  async catalog() {
    const c = await getJson<ContentCatalog>('catalog.json');
    if (!c) throw new Error('Chưa có nội dung bài học: chạy npm run content:build');
    return c;
  },
  lesson: (slug) => getJson<LessonData>(`lessons/${encodeURIComponent(slug)}.json`),
  async examples() {
    return (await getJson<ExamplesData>('examples.json')) ?? { version: '', byWord: {} };
  },
};

/** The catalog with lookup tables. */
export class ContentIndex {
  readonly lessonById = new Map<number, CatalogLesson>();
  readonly lessonBySlug = new Map<string, CatalogLesson>();
  readonly wordById = new Map<number, CatalogWord>();
  readonly wordByLemma = new Map<string, CatalogWord>();
  readonly senseById = new Map<number, { word: CatalogWord; sense: SenseDto }>();

  constructor(readonly catalog: ContentCatalog) {
    for (const l of catalog.lessons) {
      this.lessonById.set(l.id, l);
      this.lessonBySlug.set(l.slug, l);
    }
    for (const w of catalog.words) {
      this.wordById.set(w.id, w);
      this.wordByLemma.set(w.lemma, w);
      for (const s of w.senses) this.senseById.set(s.id, { word: w, sense: s });
    }
  }

  /** Sense by key, or null when the word has no such sense (removed from the dictionary). */
  sense(word: CatalogWord, key: string | null): SenseDto | null {
    if (key === null) return null;
    return word.senses.find((s) => s.key === key) ?? null;
  }
}

/** Caches the catalog, lesson files and examples of one source. */
export class ContentStore {
  private index: Promise<ContentIndex> | null = null;
  private lessons = new Map<string, Promise<LessonData | null>>();
  private examplesData: Promise<ExamplesData> | null = null;

  constructor(private readonly source: ContentSource) {}

  catalog(): Promise<ContentIndex> {
    this.index ??= this.source.catalog().then((c) => new ContentIndex(c));
    this.index.catch(() => {
      this.index = null; // retry on the next call
    });
    return this.index;
  }

  lesson(slug: string): Promise<LessonData | null> {
    let p = this.lessons.get(slug);
    if (!p) {
      p = this.source.lesson(slug);
      p.catch(() => this.lessons.delete(slug));
      this.lessons.set(slug, p);
    }
    return p;
  }

  examples(): Promise<ExamplesData> {
    this.examplesData ??= this.source.examples();
    this.examplesData.catch(() => {
      this.examplesData = null;
    });
    return this.examplesData;
  }
}
