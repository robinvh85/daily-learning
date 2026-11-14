import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { afterEach, describe, expect, it } from 'vitest';
import { newLearner, type Learner } from './helpers';

const learners: Learner[] = [];
async function learner(opts: { learner?: boolean } = {}) {
  const l = await newLearner(undefined, opts);
  learners.push(l);
  return l;
}
afterEach(async () => {
  await Promise.all(learners.splice(0).map((l) => l.close()));
});

async function denied(p: Promise<unknown>) {
  const err = await p.then(
    () => null,
    (e: { code?: string }) => e,
  );
  expect(err?.code).toBe('permission-denied');
}

describe('firestore.rules', () => {
  it("keeps each learner's data private", async () => {
    const alice = await learner();
    const bob = await learner();
    await setDoc(doc(alice.db, 'users', alice.uid, 'dailyActivity', '2026-10-24'), {
      date: '2026-10-24',
      secondsStudied: 30,
    });
    await denied(getDoc(doc(bob.db, 'users', alice.uid, 'dailyActivity', '2026-10-24')));
    await denied(getDocs(collection(bob.db, 'users', alice.uid, 'words')));
    await denied(
      setDoc(doc(bob.db, 'users', alice.uid, 'dailyActivity', '2026-10-25'), {
        date: '2026-10-25',
        secondsStudied: 1,
      }),
    );
    await denied(getDocs(collection(bob.db, 'lessons')));
  });

  it('closes everything to an account without the learner claim (not granted by user:grant)', async () => {
    const stranger = await learner({ learner: false });
    await denied(getDoc(doc(stranger.db, 'users', stranger.uid)));
    await denied(
      setDoc(doc(stranger.db, 'users', stranger.uid, 'dailyActivity', '2026-10-24'), {
        date: '2026-10-24',
        secondsStudied: 1,
      }),
    );
    await expect(stranger.store.ready).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('keeps answers and review logs append-only', async () => {
    const l = await learner();
    const ref = await addDoc(collection(l.db, 'users', l.uid, 'answers'), {
      lesson: 'x',
      question: 0,
      dictation: null,
      value: '1',
      correct: true,
      answeredAt: Timestamp.now(),
    });
    await denied(updateDoc(ref, { correct: false }));
    await denied(addDoc(collection(l.db, 'users', l.uid, 'reviewLogs'), { lemma: 'a', rating: 7 }));
  });

  it('validates grammar progress', async () => {
    const l = await learner();
    const ref = doc(l.db, 'users', l.uid, 'grammarProgress', 'past-simple-regular');
    await setDoc(ref, {
      status: 'in_progress',
      step: 1,
      score: null,
      completedAt: null,
      updatedAt: Timestamp.now(),
    });
    await denied(setDoc(ref, { status: 'done', step: 1, updatedAt: Timestamp.now() }));
    await denied(setDoc(ref, { status: 'in_progress', step: 3, updatedAt: Timestamp.now() }));
    await denied(setDoc(ref, { status: 'in_progress', step: 1, updatedAt: 'now' }));
  });

  it('validates grammar review cards', async () => {
    const l = await learner();
    const card = {
      slug: 'past-simple-regular',
      due: Timestamp.now(),
      stability: 1,
      difficulty: 5,
      scheduledDays: 1,
      learningSteps: 0,
      reps: 1,
      lapses: 0,
      state: 2,
      lastReview: null,
    };
    await setDoc(doc(l.db, 'users', l.uid, 'grammarCards', 'past-simple-regular'), card);
    await denied(setDoc(doc(l.db, 'users', l.uid, 'grammarCards', 'other'), card));
    await denied(
      setDoc(doc(l.db, 'users', l.uid, 'grammarCards', 'past-simple-regular'), {
        ...card,
        state: 9,
      }),
    );
  });

  it('validates the profile and saved word cards', async () => {
    const l = await learner();
    await denied(
      setDoc(doc(l.db, 'users', l.uid), { displayName: 'A', level: 'C2', dailyGoalMin: 15 }),
    );
    await denied(
      setDoc(doc(l.db, 'users', l.uid, 'words', 'run'), { lemma: 'run', due: 'tomorrow' }),
    );
    await denied(setDoc(doc(l.db, 'users', l.uid, 'dailyActivity', 'today'), { date: 'today' }));
  });
});
