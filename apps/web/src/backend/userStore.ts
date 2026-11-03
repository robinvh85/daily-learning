/**
 * The learner's data in Firestore (`users/{uid}/…`, see firestore.rules):
 *
 * | Path                                  | Content                                        |
 * | ------------------------------------- | ---------------------------------------------- |
 * | `users/{uid}`                         | profile: display name, level, daily goal       |
 * | `users/{uid}/lessonProgress/{slug}`   | status, step, score of a lesson                |
 * | `users/{uid}/words/{lemma}`           | a saved word and its FSRS card                 |
 * | `users/{uid}/dailyActivity/{date}`    | study seconds, lessons and reviews of a day    |
 * | `users/{uid}/answers/{auto}`          | every answer (write-only log)                  |
 * | `users/{uid}/reviewLogs/{auto}`       | every rating (write-only log)                  |
 *
 * The first four are small (one user) and kept in memory by snapshot listeners, so screens are
 * computed locally and a refetch costs no Firestore reads. Writes go through the same listeners
 * (Firestore applies local writes to them at once), so the next read sees them.
 *
 * Documents refer to content by natural keys (slug, lemma, sense key), never by the numeric ids
 * of the content files.
 */
import {
  DEFAULT_DAILY_GOAL_MIN,
  type LessonLevel,
  type LessonProgressStatus,
} from '@daily-learning/shared';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QuerySnapshot,
  type SnapshotMetadata,
  type Unsubscribe,
} from 'firebase/firestore';
import type { CardColumns, ReviewResult } from './logic/srs';
import { localDate } from './logic/srs';

export interface Profile {
  displayName: string;
  level: LessonLevel;
  dailyGoalMin: number;
}

export interface ProgressDoc {
  status: LessonProgressStatus;
  step: number;
  score: number | null;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface SavedWordDoc extends CardColumns {
  lemma: string;
  /** Saved sense key (null → first sense). */
  sense: string | null;
  /** Slug of the lesson the word was saved from. */
  sourceLesson: string | null;
  createdAt: Date;
}

export interface ActivityDoc {
  date: string;
  secondsStudied: number;
  lessonsDone: number;
  reviewsDone: number;
}

export const DEFAULT_PROFILE: Profile = {
  displayName: 'bạn',
  level: 'A2',
  dailyGoalMin: DEFAULT_DAILY_GOAL_MIN,
};

/** Firestore document id of a saved word (a lemma may contain `/` or spaces). */
export function wordDocId(lemma: string): string {
  return encodeURIComponent(lemma);
}

const toDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : fallback);
const ts = (d: Date | null) => (d ? Timestamp.fromDate(d) : null);

function readProgress(d: DocumentData): ProgressDoc {
  return {
    status: d.status as LessonProgressStatus,
    step: num(d.step),
    score: typeof d.score === 'number' ? d.score : null,
    completedAt: toDate(d.completedAt),
    updatedAt: toDate(d.updatedAt) ?? new Date(0),
  };
}

function readWord(d: DocumentData): SavedWordDoc {
  return {
    lemma: String(d.lemma),
    sense: typeof d.sense === 'string' ? d.sense : null,
    sourceLesson: typeof d.sourceLesson === 'string' ? d.sourceLesson : null,
    due: toDate(d.due) ?? new Date(0),
    stability: num(d.stability),
    difficulty: num(d.difficulty),
    scheduledDays: num(d.scheduledDays),
    learningSteps: num(d.learningSteps),
    reps: num(d.reps),
    lapses: num(d.lapses),
    state: num(d.state),
    lastReview: toDate(d.lastReview),
    createdAt: toDate(d.createdAt) ?? new Date(0),
  };
}

function readActivity(id: string, d: DocumentData): ActivityDoc {
  return {
    date: id,
    secondsStudied: num(d.secondsStudied),
    lessonsDone: num(d.lessonsDone),
    reviewsDone: num(d.reviewsDone),
  };
}

function cardFields(c: CardColumns) {
  return {
    due: Timestamp.fromDate(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduledDays: c.scheduledDays,
    learningSteps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    lastReview: ts(c.lastReview),
  };
}

/** How long to wait for the server before trusting the offline cache alone. */
const SERVER_WAIT_MS = 4000;

export class UserStore {
  profile: Profile = DEFAULT_PROFILE;
  /** The profile document exists (false until it is created on first login). */
  profileExists = false;
  private profileKnown = false;
  readonly progress = new Map<string, ProgressDoc>();
  /** Keyed by lemma. */
  readonly words = new Map<string, SavedWordDoc>();
  /** Keyed by local date `YYYY-MM-DD`. */
  readonly activity = new Map<string, ActivityDoc>();

  private readonly unsubscribe: Unsubscribe[] = [];
  /**
   * Resolves once every listener has data from the server, or from the offline cache when the
   * server does not answer within SERVER_WAIT_MS. Rejects when a listener fails (rules, auth).
   */
  readonly ready: Promise<void>;

  constructor(
    private readonly db: Firestore,
    readonly uid: string,
  ) {
    const waits: Promise<void>[] = [];
    /** Listen to a query or a document; `ready` waits for its first server snapshot. */
    const listen = <S extends { metadata: SnapshotMetadata }>(
      subscribe: (onNext: (snap: S) => void, onError: (e: Error) => void) => Unsubscribe,
      apply: (snap: S) => void,
    ) => {
      waits.push(
        new Promise<void>((resolve, reject) => {
          let cached = false;
          this.unsubscribe.push(
            subscribe((snap) => {
              apply(snap);
              if (!snap.metadata.fromCache) resolve();
              else if (!cached) {
                cached = true;
                setTimeout(resolve, SERVER_WAIT_MS);
              }
            }, reject),
          );
        }),
      );
    };
    const opts = { includeMetadataChanges: true };
    const query = (name: string) => collection(db, 'users', uid, name);

    listen<DocumentSnapshot>(
      (next, err) => onSnapshot(doc(db, 'users', uid), opts, next, err),
      (snap) => {
        const d = snap.data();
        this.profileExists = snap.exists();
        // A missing profile is only trusted when the server says so (not an empty cache).
        this.profileKnown ||= snap.exists() || !snap.metadata.fromCache;
        this.profile = d
          ? {
              displayName:
                typeof d.displayName === 'string' && d.displayName.trim()
                  ? d.displayName
                  : DEFAULT_PROFILE.displayName,
              level: (d.level as LessonLevel) ?? DEFAULT_PROFILE.level,
              dailyGoalMin: num(d.dailyGoalMin, DEFAULT_PROFILE.dailyGoalMin),
            }
          : DEFAULT_PROFILE;
      },
    );
    listen<QuerySnapshot>(
      (next, err) => onSnapshot(query('lessonProgress'), opts, next, err),
      (snap) => {
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed') this.progress.delete(ch.doc.id);
          else this.progress.set(ch.doc.id, readProgress(ch.doc.data()));
        }
      },
    );
    listen<QuerySnapshot>(
      (next, err) => onSnapshot(query('words'), opts, next, err),
      (snap) => {
        for (const ch of snap.docChanges()) {
          const w = readWord(ch.doc.data());
          if (ch.type === 'removed') this.words.delete(w.lemma);
          else this.words.set(w.lemma, w);
        }
      },
    );
    listen<QuerySnapshot>(
      (next, err) => onSnapshot(query('dailyActivity'), opts, next, err),
      (snap) => {
        for (const ch of snap.docChanges()) {
          if (ch.type === 'removed') this.activity.delete(ch.doc.id);
          else this.activity.set(ch.doc.id, readActivity(ch.doc.id, ch.doc.data()));
        }
      },
    );
    this.ready = Promise.all(waits).then(() => undefined);
    // Avoid an unhandled rejection when nobody awaits `ready` before dispose().
    this.ready.catch(() => undefined);
  }

  dispose(): void {
    for (const u of this.unsubscribe.splice(0)) u();
  }

  private ref(...path: string[]) {
    return doc(this.db, 'users', this.uid, ...path);
  }

  private activityRef(now: Date) {
    return this.ref('dailyActivity', localDate(now));
  }

  /** Create the profile document on first login (no-op when it exists). Call after `ready`. */
  async ensureProfile(displayName: string | null): Promise<void> {
    if (this.profileExists || !this.profileKnown) return;
    await setDoc(this.ref(), {
      displayName: displayName?.trim() || DEFAULT_PROFILE.displayName,
      level: DEFAULT_PROFILE.level,
      dailyGoalMin: DEFAULT_PROFILE.dailyGoalMin,
      createdAt: Timestamp.now(),
    });
  }

  async addAnswer(a: {
    lesson: string;
    question: number | null;
    dictation: number | null;
    value: string;
    correct: boolean;
    at: Date;
  }): Promise<void> {
    await addDoc(collection(this.db, 'users', this.uid, 'answers'), {
      lesson: a.lesson,
      question: a.question,
      dictation: a.dictation,
      value: a.value,
      correct: a.correct,
      answeredAt: Timestamp.fromDate(a.at),
    });
  }

  /** Save lesson progress; `completedNow` also counts a finished lesson for today. */
  async saveProgress(slug: string, p: ProgressDoc, completedNow: boolean, now: Date) {
    const batch = writeBatch(this.db);
    batch.set(this.ref('lessonProgress', slug), {
      status: p.status,
      step: p.step,
      score: p.score,
      completedAt: ts(p.completedAt),
      updatedAt: Timestamp.fromDate(p.updatedAt),
    });
    if (completedNow) {
      batch.set(
        this.activityRef(now),
        { date: localDate(now), lessonsDone: increment(1) },
        { merge: true },
      );
    }
    await batch.commit();
  }

  async saveWord(w: SavedWordDoc): Promise<void> {
    await setDoc(this.ref('words', wordDocId(w.lemma)), {
      lemma: w.lemma,
      sense: w.sense,
      sourceLesson: w.sourceLesson,
      ...cardFields(w),
      createdAt: Timestamp.fromDate(w.createdAt),
    });
  }

  async removeWord(lemma: string): Promise<void> {
    await deleteDoc(this.ref('words', wordDocId(lemma)));
  }

  async postponeWord(lemma: string, due: Date): Promise<void> {
    await updateDoc(this.ref('words', wordDocId(lemma)), { due: Timestamp.fromDate(due) });
  }

  /** Apply a rating: new card state, a review log and today's review count, atomically. */
  async recordReview(lemma: string, result: ReviewResult, now: Date): Promise<void> {
    const batch = writeBatch(this.db);
    batch.update(this.ref('words', wordDocId(lemma)), cardFields(result.card));
    const log = result.log;
    batch.set(doc(collection(this.db, 'users', this.uid, 'reviewLogs')), {
      lemma,
      rating: log.rating,
      reviewedAt: Timestamp.fromDate(log.reviewedAt),
      elapsedDays: log.elapsedDays,
      state: log.state,
      stability: log.stability,
      difficulty: log.difficulty,
      scheduledDays: log.scheduledDays,
      due: Timestamp.fromDate(log.due),
    });
    batch.set(
      this.activityRef(now),
      { date: localDate(now), reviewsDone: increment(1) },
      { merge: true },
    );
    await batch.commit();
  }

  async addStudySeconds(seconds: number, now: Date): Promise<void> {
    await setDoc(
      this.activityRef(now),
      { date: localDate(now), secondsStudied: increment(seconds) },
      { merge: true },
    );
  }
}
