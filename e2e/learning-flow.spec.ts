/**
 * Main learning flow (plan Phase 7): Home → Reading → Listening → Vocab, on a fresh database.
 * Correct answers are read from the lesson YAML, so the test follows content edits.
 * Runs without audio files (the listening page then shows its "no audio" notice).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { parse } from 'yaml';

interface LessonYaml {
  title: string;
  questions: { prompt: string; options: string[]; correct: number }[];
  dictation: { answer: string }[];
}
interface DictionaryYaml {
  lemma: string;
  senses: { vi: string }[];
}

const CONTENT = join(import.meta.dirname, '..', 'content');
const readYaml = <T>(...parts: string[]) =>
  parse(readFileSync(join(CONTENT, ...parts), 'utf8')) as T;

const READING = 'a-new-coffee-shop';
const LISTENING = 'at-the-train-station';
const WORD = 'bakery';

const reading = readYaml<LessonYaml>('lessons', 'a2', READING, 'lesson.yaml');
const listening = readYaml<LessonYaml>('lessons', 'a2', LISTENING, 'lesson.yaml');
const word = readYaml<DictionaryYaml>('dictionary', `${WORD}.yaml`);

const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng chính' });
const vocabLink = (page: Page) => nav(page).getByRole('link', { name: /Từ vựng/ });

async function expectDue(page: Page, n: number) {
  await expect(vocabLink(page)).toContainText(`${n} thẻ đến hạn`);
}

async function answerQuiz(quiz: Locator, questions: LessonYaml['questions']) {
  for (const q of questions) {
    const question = quiz.getByRole('group', { name: q.prompt });
    await question.getByRole('button', { name: q.options[q.correct]!, exact: true }).click();
    await expect(question.getByRole('status')).toBeVisible();
    await expect(question.getByRole('button', { pressed: true })).toHaveText(q.options[q.correct]!);
  }
}

test('reading → listening → vocab review', async ({ page }) => {
  await test.step('home shows today’s lesson', async () => {
    await page.goto('/');
    await expect(page).toHaveTitle('Trang chủ · DailyLearning');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Chào E2E');
    await expect(page.getByRole('region', { name: 'Cuộc sống quanh khu phố' })).toBeVisible();
    await expectDue(page, 0);
  });

  await test.step('open today’s reading lesson', async () => {
    await page
      .getByRole('list', { name: 'Các bước hôm nay' })
      .getByRole('link', { name: new RegExp(reading.title) })
      .click();
    await expect(page).toHaveURL(new RegExp(`/read/${READING}$`));
    await expect(page.getByRole('heading', { level: 1, name: reading.title })).toBeVisible();
    await expect(page).toHaveTitle(`${reading.title} – Bài đọc · DailyLearning`);
  });

  await test.step('click a word: the WordCard shows its meaning', async () => {
    await page
      .getByTestId('reading-text')
      .getByRole('button', { name: WORD, exact: true })
      .first()
      .click();
    const card = page.getByRole('region', { name: 'Từ đang chọn' });
    await expect(card.getByRole('heading', { name: word.lemma })).toBeVisible();
    await expect(card).toContainText(word.senses[0]!.vi);
  });

  await test.step('save the word', async () => {
    const card = page.getByRole('region', { name: 'Từ đang chọn' });
    await card.getByRole('button', { name: 'Lưu vào sổ từ để ôn' }).click();
    await expect(card.getByRole('button', { name: 'Đã lưu vào sổ từ' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expectDue(page, 1);
  });

  await test.step('answer every quiz question correctly', async () => {
    const quiz = page.getByRole('region', { name: 'Câu hỏi hiểu bài' });
    await answerQuiz(quiz, reading.questions);
    await expect(quiz).toContainText(`${reading.questions.length}/${reading.questions.length}`);
  });

  await test.step('go to the listening lesson (no audio yet is fine)', async () => {
    await nav(page).getByRole('link', { name: 'Trang chủ' }).click();
    await page
      .getByRole('list', { name: 'Các bước hôm nay' })
      .getByRole('link', { name: new RegExp(listening.title) })
      .click();
    await expect(page).toHaveURL(new RegExp(`/listen/${LISTENING}$`));
    await expect(page.getByRole('heading', { level: 1, name: listening.title })).toBeVisible();
    await expect(page).toHaveTitle(`${listening.title} – Bài nghe · DailyLearning`);
    // Either the player (audio generated on the Mac) or the notice explaining how to make it.
    await expect(
      page
        .getByRole('region', { name: 'Trình phát' })
        .or(page.getByRole('heading', { name: 'Bài này chưa có audio' })),
    ).toBeVisible();
  });

  await test.step('show the transcript', async () => {
    const toggle = page.getByRole('button', { name: 'Hiện lời thoại' });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Ẩn lời thoại' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page.locator('#transcript-lines li').first()).toBeVisible();
  });

  await test.step('dictation with the correct answers', async () => {
    await page.getByRole('tab', { name: 'Nghe chép' }).click();
    const inputs = page.getByRole('tabpanel').getByRole('textbox');
    await expect(inputs).toHaveCount(listening.dictation.length);
    for (const [i, item] of listening.dictation.entries()) {
      await inputs.nth(i).fill(item.answer);
    }
    await page.getByRole('button', { name: 'Kiểm tra' }).click();
    const n = listening.dictation.length;
    await expect(page.getByRole('tabpanel').getByText(`Đúng ${n}/${n}`)).toBeVisible();
  });

  await test.step('vocab: the saved word is due, flip and rate it', async () => {
    await vocabLink(page).click();
    await expect(page).toHaveURL(/\/vocab$/);
    await expect(page).toHaveTitle('Ôn từ vựng · DailyLearning');
    await expect(page.getByRole('heading', { name: word.lemma, exact: true })).toBeVisible();
    await expectDue(page, 1);

    await page.getByRole('button', { name: 'Xem nghĩa' }).click();
    await expect(page.getByText(word.senses[0]!.vi).first()).toBeVisible();
    const ratings = page.getByRole('group', { name: 'Bạn nhớ từ này thế nào?' });
    await ratings.getByRole('button', { name: /^Nhớ:/ }).click();

    // The only due card was rated → the sidebar badge drops to 0.
    await expectDue(page, 0);
  });
});
