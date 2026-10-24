# DailyLearning — Kế hoạch v1 (Đọc & Nghe)

> Ngày lập: 2026-10-24 · Trạng thái: **Draft, chờ duyệt**
> Mockup tham chiếu: canvas "English Learning Web Mockup" (4 màn hình: Trang chủ, Bài đọc, Bài nghe, Ôn từ vựng)

## 1. Mục tiêu và phạm vi

**Mục tiêu v1:** web app học tiếng Anh mỗi ngày ~15 phút, tập trung **Đọc** và **Nghe**, trình độ A2 → B1.

**Trong phạm vi v1**

| Màn hình | Chức năng |
|---|---|
| Trang chủ | Bài học hôm nay (Đọc → Nghe → Ôn từ), chuỗi ngày học, tiến độ A2→B1, số từ đã thuộc, thời gian học tuần này, thư viện bài đọc/nghe |
| Bài đọc | Bài theo cấp CEFR; bấm từ để xem nghĩa, IPA, ví dụ, collocation; lưu từ vào sổ; song ngữ theo đoạn; chỉnh cỡ chữ; nghe bài đọc; câu hỏi hiểu bài chấm ngay |
| Bài nghe | Player (play/pause, câu trước/sau, lặp câu, tốc độ 0.75/1/1.25×), waveform tiến độ; lời thoại ẩn mặc định, bấm dòng để nhảy đến câu; tab Nghe chép (điền từ, kiểm tra) và Nghe hiểu (trắc nghiệm) |
| Ôn từ vựng | Thẻ từ lặp lại ngắt quãng (Quên / Khó / Nhớ / Dễ), tiến độ ôn hôm nay, sổ từ có lọc theo nguồn (bài đọc / bài nghe) và trạng thái (Mới / Đang ôn / Đã thuộc) |

**Ngoài phạm vi v1 (để v2):** Nói (shadowing, chấm phát âm), Viết, nhiều người dùng / đăng ký công khai, app mobile native.

## 2. Quyết định kỹ thuật

### 2.1 Stack

| Lớp | Chọn | Lý do |
|---|---|---|
| Ngôn ngữ | TypeScript (cả server và web) | Dùng chung type giữa API và UI, bắt lỗi sớm |
| Repo | npm workspaces (monorepo): `apps/server`, `apps/web`, `packages/shared` | Một repo, một lệnh build, chia sẻ type/schema |
| Server | Node.js 22 LTS + **Fastify** | Nhẹ và nhanh hơn Express, có sẵn schema validation, serve static tốt |
| Validation | Zod (schema dùng chung trong `packages/shared`) | Một nguồn sự thật cho request/response |
| Web | **React 18 + Vite** + React Router + TanStack Query | Vite build nhanh; TanStack Query lo cache/refetch API |
| Style | CSS Modules + CSS variables (token màu/size từ mockup) | Không phụ thuộc framework CSS, dễ bê token từ mockup. (Phương án khác: Tailwind — nhanh hơn khi dựng UI nhưng markup dài) |
| SRS | **FSRS** qua thư viện `ts-fsrs` | 4 mức Again/Hard/Good/Easy khớp đúng mockup; chính xác hơn SM-2 |
| Test | Vitest (unit + API), Playwright (E2E vài luồng chính) | |
| Chạy production | 1 process Node serve cả API và bản build React | Ít tài nguyên nhất, không cần server riêng cho frontend |

### 2.2 Database

**Chọn: SQLite** (file `data/app.db`) qua `better-sqlite3` + **Drizzle ORM** (migration + query có type).

So sánh các phương án ít tốn tài nguyên:

| Phương án | Ưu | Nhược | Kết luận |
|---|---|---|---|
| **SQLite + better-sqlite3** | Không cần DB server, RAM rất thấp, đọc nhanh, backup = copy 1 file, đủ cho hàng nghìn user đọc nhiều | Chỉ 1 writer tại một thời điểm (với WAL thì không thành vấn đề ở quy mô này); khó scale ngang nhiều server | **Chọn** |
| `node:sqlite` (built-in Node 22) | Không cần native module | API vẫn đang được đánh dấu experimental/active development, hệ sinh thái ORM chưa hỗ trợ ổn định | Theo dõi, chưa dùng |
| libSQL / Turso | Tương thích SQLite, có bản cloud và replication | Thêm phụ thuộc dịch vụ ngoài, không cần thiết cho v1 | Có thể chuyển sau nếu cần |
| PostgreSQL | Mạnh, nhiều user ghi đồng thời | Cần chạy DB server riêng (~100MB+ RAM), vận hành phức tạp hơn | Chỉ khi có nhiều user thật |
| File JSON (lowdb) | Đơn giản nhất | Không có query, dễ hỏng dữ liệu khi ghi đồng thời | Không chọn |

Cấu hình SQLite: `journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL`.
Drizzle cho phép đổi sang libSQL/Postgres sau này với thay đổi nhỏ.

### 2.3 Nội dung bài học, audio và ảnh (commit vào git)

- Nội dung bài học viết dưới dạng file trong repo: `content/lessons/<level>/<slug>/lesson.yaml` (+ `audio.mp3`, `cover.webp`, `timings.json`).
- Script `npm run content:sync` đọc thư mục `content/`, validate bằng Zod, rồi **upsert vào SQLite**. DB chỉ lưu metadata + đường dẫn file; audio/ảnh serve tĩnh từ `content/` (qua `@fastify/static`, có cache header).
- Chuẩn file để repo không phình to:
  - Audio: MP3 mono 64 kbps (~0.5 MB/phút). Có thể cân nhắc Opus/WebM 32 kbps (nhỏ hơn một nửa) nhưng Safari cũ hỗ trợ kém hơn → v1 dùng MP3.
  - Ảnh: WebP, tối đa 1200px chiều rộng, < 150 KB.
  - Thêm `.gitattributes` đánh dấu `*.mp3 *.webp binary`.
- **Hosting: GitHub — Đã chốt (2026-10-24)**, repo private.
- Ước tính: 200 bài nghe × ~2 phút ≈ 200 MB. GitHub cảnh báo file > 50 MB, chặn file > 100 MB, và khuyến nghị repo dưới ~1 GB. **Nếu repo vượt ~1 GB → chuyển sang Git LFS** (không cần sửa code, chỉ đổi cách lưu file; kiểm tra hạn mức LFS miễn phí hiện tại của GitHub trước khi chuyển).
- Thêm `pre-commit` check (husky + lint-staged): chặn commit file media > 5 MB và chặn file có dạng key (`*.json` chứa `private_key`).

### 2.4 Nguồn audio và mốc thời gian theo câu

Tính năng "bấm dòng nhảy đến câu", "lặp câu", "nghe chép" cần **thời điểm bắt đầu/kết thúc của từng câu**.

Cách làm đề xuất (không phụ thuộc nhà cung cấp TTS):
1. Script `npm run content:tts <slug>` gọi TTS **từng câu riêng** (giọng A/B khác nhau cho hội thoại).
2. Ghép các câu bằng `ffmpeg` (chèn khoảng lặng ~400 ms), ghi lại offset → `timings.json`.
3. Commit `audio.mp3` + `timings.json`.

**Nhà cung cấp TTS — Đã chốt (2026-10-24): Google Cloud Text-to-Speech** (anh đã có tài khoản).

- Thư viện: `@google-cloud/text-to-speech` (Node), chỉ dùng trong `scripts/`, **không** chạy trong server lúc người học dùng app.
- Xác thực: service account JSON, đường dẫn đặt ở `GOOGLE_APPLICATION_CREDENTIALS` trong `.env`. File key nằm ngoài repo hoặc trong `secrets/` đã thêm vào `.gitignore`. **Không bao giờ commit key.**
- **Cập nhật (2026-10-24, Phase 3):** dùng **API key** (`GOOGLE_TTS_API_KEY` trong `.env`) gọi thẳng REST `v1/text:synthesize` và `v1/voices` bằng `fetch`, không dùng thư viện `@google-cloud/text-to-speech` và service account.
- Output: `audioEncoding: MP3`, sample rate 24 kHz; sau khi ghép bằng ffmpeg thì chuẩn hóa về MP3 mono 64 kbps (mục 2.3).
- Dùng TTS cho 3 việc: (1) audio bài nghe (giọng A/B), (2) "Nghe bài đọc", (3) phát âm từng từ trong glossary (`content/words/<lemma>.mp3`, dùng chung giữa các bài).
- **Giọng chuẩn — Đã chốt (2026-10-24): Anh-Mỹ (`en-US`)** cho mọi audio. Hội thoại dùng 2 giọng `en-US` khác giới tính để dễ phân biệt người nói.
- **Chọn loại giọng:** nghe thử ở đầu Phase 3 rồi chốt, ưu tiên theo thứ tự: Chirp 3 HD → Neural2 → WaveNet. Theo trang giá Google (tra ngày 2026-10-24, có thể thay đổi), hạn mức miễn phí mỗi tháng: Chirp 3 HD và Neural2 1 triệu ký tự, WaveNet và Standard 4 triệu ký tự. Cả lộ trình A2→B1 ước tính ~300.000 ký tự, tạo một lần → nằm trong hạn mức miễn phí.
- **Chống phát sinh phí:**
  - Cache theo hash (`text + voice + speakingRate`) trong `content/.tts-cache.json` → chạy lại script không gọi API cho câu đã có audio. (Phase 3: index và clip `content/.tts-clips/` đều gitignore, chỉ commit `audio.mp3`/`words/*.mp3`; bài có `timings.json` khớp nội dung thì được bỏ qua.)
  - Script đếm ký tự trước khi gọi, in ra tổng, dừng nếu một lần chạy vượt `TTS_MAX_CHARS` (mặc định 50.000).
  - Đặt **Budget alert** trong Google Cloud Billing (ví dụ 1 USD) để được báo ngay nếu có phí.
- Không cần tính năng timepoint của Google vì đã tạo audio theo từng câu (offset chính xác hơn và đơn giản hơn).

Audio thật (podcast…) chỉ thêm từ B1 và chỉ khi rõ bản quyền.

### 2.5 Từ điển (tra từ khi bấm vào chữ)

**Đã chốt (2026-10-24): tra được MỌI từ trong bài ngay từ v1**, bằng một từ điển riêng của dự án, soạn bằng Claude trong Cowork cùng lúc với bài học (cách 1, chi phí thêm = 0).

**Ý tưởng chính:** bài học là nội dung biết trước → "mọi từ" = tập hữu hạn các từ xuất hiện trong `content/lessons/`. Mọi nghĩa được soạn sẵn, lưu trong git, `content:sync` nạp vào SQLite. **Không tra từ qua API lúc đang học.**

**Hai lớp từ trong mỗi bài**
- **Từ trọng tâm (focus words)**, 6–10 từ/bài: gạch chân chấm như mockup, nằm trong "Từ mới trong bài", gợi ý lưu vào sổ từ.
- **Mọi từ còn lại:** bấm vào vẫn mở WordCard (không gạch chân để bài đọc không rối).
- Tên riêng, số, từ cần bỏ qua: khai báo trong `ignore` của `lesson.yaml` (ví dụ `Lan`, `Oxford`, `10:15`).

**Định dạng từ điển:** mỗi từ gốc một file `content/dictionary/<lemma>.yaml` (diff gọn, ít xung đột):

```yaml
lemma: run
ipa_us: /rʌn/
cefr: A1
oxford3000: true
forms: [runs, ran, running]          # dùng để map dạng trong bài → từ gốc, không cần thư viện NLP
senses:
  - key: manage
    pos: verb
    vi: điều hành, quản lý (cửa hàng, công ty)
    en: to be in charge of a business or organization
    collocations: [run a business, run a shop]
    example: She wants to run her own business.
  - key: move
    pos: verb
    vi: chạy
    en: to move quickly on foot
    collocations: [run fast, run for the bus]
    example: I ran to catch the bus.
status: draft                         # draft | reviewed
```

- **Cụm từ nhiều chữ** (phrasal verb, collocation cố định) là entry riêng, ví dụ `bring back.yaml`. Khi tách từ, ưu tiên khớp cụm dài nhất trước.
- **Chọn nghĩa theo ngữ cảnh:** trong `lesson.yaml` có `senses: { run: manage }`. Nếu một từ xuất hiện 2 lần với 2 nghĩa khác nhau thì ghi theo lần xuất hiện: `run#2: move`. Không khai báo → lấy nghĩa đầu tiên.
- **IPA theo phát âm Mỹ** để khớp audio (ví dụ `open` /ˈoʊpən/, không phải /ˈəʊpən/).
- `status: draft` → WordCard hiện nhãn nhỏ "bản nháp"; sau khi duyệt đổi thành `reviewed`.
- Link tra ngoài (Cambridge, phần US) vẫn có trong WordCard để đối chiếu.

**Quy trình soạn bài (trong Cowork)**
1. Claude viết `lesson.yaml` (bài, bản dịch, câu hỏi, nghe chép, focus words, `senses`, `ignore`).
2. Chạy `npm run content:check-dict <slug>` → liệt kê token chưa có trong từ điển, và từ nhiều nghĩa chưa được chọn nghĩa.
3. Claude tạo các file `content/dictionary/*.yaml` còn thiếu (`status: draft`), chọn nghĩa theo đúng câu trong bài.
4. Duyệt nhanh (anh hoặc Claude kiểm tra lại) → `reviewed`.
5. `npm run content:tts` (audio bài + phát âm từ mới) → `npm run content:sync`.

**Kiểm soát chất lượng**
- CI (`content:sync --dry-run`) **báo lỗi** nếu bài có token chưa có trong từ điển hoặc chưa được khai báo trong `ignore` → không bao giờ có từ bấm vào mà trống.
- Báo cáo `content:stats`: số entry, tỷ lệ `reviewed`, độ phủ Oxford 3000.
- Ước tính quy mô: ~3.000 từ gốc cho lộ trình A2→B1 (giả định, sẽ đo lại sau 20 bài đầu).

### 2.6 Môi trường chạy, người dùng và đăng nhập

**Quyết định (2026-10-24):** v1 chạy **local trên máy cá nhân**, sau này có thể lên VPS.

- Cấu hình qua biến môi trường (`.env`, có `.env.example` commit kèm):
  - `HOST` (mặc định `127.0.0.1`), `PORT` (mặc định `5173` khi dev, `3000` khi chạy bản build)
  - `DB_PATH` (mặc định `./data/app.db`)
  - `AUTH_MODE` = `none` | `password`
- **Local (`AUTH_MODE=none`, mặc định):** không có màn hình đăng nhập. Server tự tạo 1 user mặc định và gắn mọi request vào user đó. Server chỉ nghe ở `127.0.0.1` nên máy khác trong mạng không truy cập được.
- **VPS sau này (`AUTH_MODE=password`):** bật đăng nhập bằng mật khẩu (hash argon2) + session cookie httpOnly, Secure, SameSite=Lax. Server **từ chối khởi động** nếu `HOST` khác `127.0.0.1`/`localhost` mà `AUTH_MODE=none`, tránh vô tình mở app ra ngoài không có bảo vệ.
- Muốn học bằng điện thoại trong cùng mạng Wi-Fi: đặt `HOST=0.0.0.0` và **bắt buộc** `AUTH_MODE=password` (theo quy tắc trên).
- Schema vẫn có `user_id` ở mọi bảng tiến độ, nên khi chuyển lên VPS hoặc nhiều user không phải migrate lớn.
- Code auth (middleware, route `/auth/*`) viết ngay từ Phase 2 nhưng chỉ bật khi cần, để việc lên VPS chỉ là đổi cấu hình.

## 3. Cấu trúc thư mục

```
daily-learning/
├─ .claude/plans/                 # kế hoạch (file này)
├─ apps/
│  ├─ server/
│  │  ├─ src/
│  │  │  ├─ db/ (schema.ts, client.ts, migrations/)
│  │  │  ├─ modules/ (auth, lessons, reading, listening, vocab, progress, today)
│  │  │  ├─ services/ (srs.ts, daily-plan.ts, streak.ts)
│  │  │  └─ index.ts
│  │  └─ test/
│  └─ web/
│     ├─ src/
│     │  ├─ pages/ (Home, Reading, Listening, Vocab, Login, Library)
│     │  ├─ components/ (Sidebar, WordCard, AudioPlayer, Waveform, Quiz, Dictation, Flashcard…)
│     │  ├─ api/ (client + TanStack Query hooks)
│     │  └─ styles/ (tokens.css)
│     └─ index.html
├─ packages/shared/               # Zod schemas + types dùng chung
├─ content/
│  ├─ lessons/a2/<slug>/ (lesson.yaml, audio.mp3, timings.json, cover.webp)
│  ├─ dictionary/<lemma>.yaml     # từ điển riêng, mỗi từ gốc một file
│  └─ words/<lemma>.mp3          # audio phát âm từ
├─ scripts/ (content-sync.ts, tts.ts, seed.ts, backup.sh)
├─ data/                          # app.db (KHÔNG commit, nằm trong .gitignore)
├─ .gitattributes
└─ package.json
```

## 4. Mô hình dữ liệu (SQLite)

**Nội dung (sinh từ `content/`, có thể xóa và sync lại)**

| Bảng | Cột chính |
|---|---|
| `lessons` | id, slug, kind (`reading`/`listening`), level (A2, A2+, B1), title, topic, word_count, duration_ms, audio_path, cover_path, order_index |
| `segments` | id, lesson_id, idx, paragraph_idx, speaker (A/B/null), text_en, text_vi, start_ms, end_ms |
| `words` | id, lemma, ipa_us, cefr, oxford3000 (bool), is_phrase, status (draft/reviewed), audio_path |
| `word_forms` | form (unique), word_id — tra dạng xuất hiện trong bài → từ gốc |
| `word_senses` | id, word_id, key, pos, meaning_vi, definition_en, collocations (JSON), example |
| `lesson_tokens` | lesson_id, segment_id, idx, surface, start_char, end_char, word_id, sense_id — tính sẵn khi sync, UI chỉ việc render |
| `lesson_words` | lesson_id, word_id, sense_id — danh sách từ trọng tâm (focus words) |
| `questions` | id, lesson_id, prompt, options (JSON), correct_idx, feedback_ok, feedback_wrong, evidence_segment_id |
| `dictation_items` | id, lesson_id, segment_id, answer, before_text, after_text |
| `daily_plans_template` | ngày thứ N của lộ trình → reading_lesson_id, listening_lesson_id |

**Tiến độ người dùng (phải backup)**

| Bảng | Cột chính |
|---|---|
| `users` | id, email, password_hash, level, daily_goal_min, created_at |
| `lesson_progress` | user_id, lesson_id, status, step, score, completed_at |
| `answers` | user_id, question_id / dictation_item_id, value, correct, answered_at |
| `user_words` | user_id, word_id, sense_id (nghĩa lúc lưu), source_lesson_id, FSRS state (due, stability, difficulty, reps, lapses, state, last_review) |
| `review_logs` | user_id, word_id, rating, reviewed_at, elapsed_days |
| `daily_activity` | user_id, date, seconds_studied, lessons_done, reviews_done (tính streak + biểu đồ tuần) |

## 5. API (REST, prefix `/api`)

| Method | Endpoint | Dùng cho |
|---|---|---|
| POST | `/auth/login`, `/auth/logout`; GET `/auth/me` | Đăng nhập (`/auth/me` luôn có; login/logout chỉ bật khi `AUTH_MODE=password`) |
| GET | `/today` | Bài học hôm nay + trạng thái 3 bước |
| GET | `/dashboard` | Streak, % lộ trình, số từ, thời gian tuần |
| GET | `/lessons?kind=&level=&topic=` | Thư viện |
| GET | `/lessons/:slug` | Nội dung bài (segments, glossary, questions, dictation, timings) |
| POST | `/lessons/:slug/answers` | Nộp câu hỏi / nghe chép → chấm, trả feedback |
| POST | `/lessons/:slug/progress` | Cập nhật bước, đánh dấu hoàn thành |
| POST | `/activity/heartbeat` | Cộng thời gian học (gửi mỗi 30s khi tab đang mở và có tương tác) |
| GET | `/vocab?filter=&status=` | Sổ từ |
| POST/DELETE | `/vocab/:wordId` | Lưu / bỏ từ |
| GET | `/reviews/due` | Hàng thẻ cần ôn hôm nay |
| POST | `/reviews/:wordId` | Gửi rating 1–4 → FSRS tính lịch ôn tiếp |

## 6. Các giai đoạn triển khai

Mỗi phase kết thúc bằng một bản chạy được và commit riêng.

### Phase 0 — Khởi tạo (≈ 0.5 ngày)
- [x] npm workspaces, TypeScript, ESLint + Prettier, `.gitignore`, `.gitattributes`, `.nvmrc` (Node 22)
- [x] Fastify "hello" + Vite React "hello", proxy `/api` khi dev, script `dev` chạy đồng thời
- [x] Vitest chạy được ở cả 2 app
- [ ] Tạo repo private trên GitHub, push commit đầu (người dùng tự làm)
- [x] GitHub Actions: workflow `ci.yml` chạy lint + typecheck + test + `content:sync --dry-run` (validate bài học) khi push/PR — bước `content:sync --dry-run` đang để dạng comment, bật ở Phase 1
- [x] Hook pre-commit (husky + lint-staged) theo mục 2.3
- **Xong khi:** `npm run dev` mở được web gọi được `/api/health`

### Phase 1 — Database và pipeline nội dung (≈ 1–1.5 ngày)
- [x] Drizzle schema + migration (mục 4), bật WAL
- [x] Định dạng `lesson.yaml` + Zod schema trong `packages/shared`
- [x] Định dạng `content/dictionary/<lemma>.yaml` + Zod schema
- [x] Tokenizer: tách từ theo segment, khớp cụm nhiều chữ dài nhất trước, map qua `word_forms`, áp `senses` và `ignore` → `lesson_tokens`
- [x] `content:sync` (validate → upsert, báo lỗi rõ ràng, lỗi nếu có token thiếu từ điển)
- [x] `content:check-dict <slug>` và `content:stats`
- [x] 2 bài mẫu từ mockup: "A New Coffee Shop" (đọc), "At the Train Station" (nghe, tạm thời chưa có audio), kèm đầy đủ entry từ điển cho mọi từ trong 2 bài
- **Xong khi:** sync 2 bài vào DB, mọi token của 2 bài có nghĩa, test validate bắt được file lỗi và từ thiếu

### Phase 2 — Khung UI + Bài đọc (≈ 2 ngày)
- [x] Token màu/typography từ mockup (`tokens.css`), Sidebar, layout responsive (menu xếp lên trên ở mobile)
- [x] Auth theo `AUTH_MODE` (mặc định `none` + user mặc định; chế độ `password` có test nhưng chưa dùng)
- [x] Trang Bài đọc: render đoạn văn từ `lesson_tokens` (mọi từ bấm được, focus words gạch chân), WordCard (nghĩa theo ngữ cảnh, IPA Mỹ, phát âm, collocation, nhãn "bản nháp", link Cambridge US), lưu từ, song ngữ, cỡ chữ (nhớ lựa chọn trong localStorage), câu hỏi chấm ngay
- [x] Lời thoại ở trang Bài nghe dùng chung component render token → bấm từ cũng mở WordCard (làm ở Phase 3)
- **Xong khi:** đọc hết 1 bài, trả lời câu hỏi, lưu từ → dữ liệu nằm trong DB

### Phase 3 — Audio pipeline + Bài nghe (≈ 2–3 ngày)
- [ ] Tạo API key + bật Text-to-Speech API trên Google Cloud, đặt Budget alert (người dùng chạy trên Mac)
- [x] Lệnh `content:tts:voices` (liệt kê giọng, `--sample` tạo file nghe thử 8 giọng vào `tmp/voice-samples/`)
- [ ] Nghe thử cùng 1 đoạn với Chirp 3 HD / Neural2 / WaveNet (chỉ `en-US`) → chốt giọng A, giọng B, giọng đọc bài trong `content/tts.config.yaml` (người dùng chạy trên Mac)
- [x] Script `content:tts` (từng câu → Google TTS → ffmpeg ghép → `timings.json`), có cache và giới hạn ký tự
- [x] Script `content:tts-words` tạo audio phát âm cho từ trong glossary
- [ ] Chạy TTS thật cho 2 bài mẫu + từ, `content:sync`, commit audio (người dùng chạy trên Mac)
- [x] AudioPlayer: play/pause, tốc độ (`playbackRate`), câu trước/sau, lặp câu, waveform tĩnh (tính sẵn peaks lúc tạo audio, lưu vào `timings.json`)
- [x] Lời thoại ẩn/hiện, highlight câu đang phát, bấm dòng để seek
- [x] Tab Nghe chép (so khớp không phân biệt hoa thường, bỏ dấu câu) và Nghe hiểu
- [x] Nút "Nghe bài đọc" ở trang Đọc dùng chung pipeline
- **Xong khi:** nghe 1 bài, làm nghe chép, lặp từng câu chính xác theo mốc thời gian

### Phase 4 — Từ vựng và SRS (≈ 1.5 ngày)
- [ ] Tích hợp `ts-fsrs`, unit test lịch ôn
- [ ] Trang Ôn từ: lật thẻ, 4 nút rating hiển thị khoảng thời gian tiếp theo thật (lấy từ FSRS, không hard-code), thanh tiến độ hôm nay
- [ ] Sổ từ: lọc nguồn + trạng thái; badge số thẻ đến hạn ở Sidebar
- **Xong khi:** từ lưu ở bài đọc xuất hiện trong hàng ôn, rating cập nhật ngày đến hạn đúng

### Phase 5 — Trang chủ, tiến độ, bài học hôm nay (≈ 1.5 ngày)
- [ ] Service tạo "bài học hôm nay" (bài đọc + bài nghe tiếp theo trong lộ trình + số thẻ đến hạn)
- [ ] Streak (theo múi giờ Asia/Ho_Chi_Minh), thời gian học tuần, % lộ trình A2→B1, số từ đã thuộc
- [ ] Thư viện bài đọc/nghe có lọc cấp độ và chủ đề
- **Xong khi:** mở app mỗi ngày thấy đúng bài tiếp theo, số liệu khớp với DB

### Phase 6 — Nội dung thật (song song với Phase 2–5, liên tục)
- [ ] Viết 20 bài A2 (10 đọc + 10 nghe) ưu tiên từ thông dụng (Oxford 3000), mỗi bài có 6–10 focus words, 3–5 câu hỏi, 3 câu nghe chép, theo quy trình soạn bài ở mục 2.5
- [ ] Bổ sung entry từ điển cho mọi từ trong các bài (Claude trong Cowork), duyệt sang `reviewed`
- [ ] Checklist review: đúng cấp độ, không lỗi ngữ pháp, nghĩa tiếng Việt chính xác và đúng ngữ cảnh

### Phase 7 — Hoàn thiện và chạy local (≈ 1 ngày)
- [ ] Playwright E2E: luồng Đọc → Nghe → Ôn từ
- [ ] Kiểm tra a11y cơ bản (dùng được bằng bàn phím, tương phản màu, nút ≥ 44px)
- [ ] Build production: Fastify serve `apps/web/dist` + `content/` (static, cache dài cho audio/ảnh)
- [ ] `npm start` chạy bản build tại `http://127.0.0.1:3000`; tự chạy migration khi khởi động
- [ ] ~~Backup DB local~~ **Tạm hoãn (2026-10-24)**, xem mục 9 (Backlog)
- [ ] README: cài đặt, chạy
- [ ] (Tùy chọn) Tự khởi động cùng macOS bằng `launchd`, nếu muốn mở trình duyệt là học ngay

### Phase 8 — Lên VPS (sau này, khi cần) (≈ 0.5–1 ngày)
- [ ] Bật `AUTH_MODE=password`, tạo user bằng lệnh `npm run user:create`
- [ ] VPS nhỏ (1 vCPU / 1 GB RAM là đủ): systemd hoặc PM2, Caddy làm reverse proxy + HTTPS tự động
- [ ] Chuyển dữ liệu: copy file backup DB mới nhất lên VPS (nội dung bài học đã có sẵn trong git)
- [ ] Backup trên VPS: cron hằng ngày giữ 14 bản, hoặc Litestream sao lưu liên tục lên S3/R2
- [ ] Rate limit cho `/auth/login`

**Tổng ước tính:** khoảng 12–14 ngày làm việc (đã cộng ~1 ngày cho từ điển và tokenizer) cho phần code, chưa tính thời gian viết nội dung. Đây là ước lượng thô, sẽ chỉnh lại sau Phase 1.

## 7. Rủi ro và cách giảm

| Rủi ro | Mức | Cách giảm |
|---|---|---|
| Repo phình to vì audio | Trung bình | Chuẩn nén ở 2.3; theo dõi `du -sh content/`; chuyển Git LFS khi > ~1 GB |
| Mốc thời gian câu bị lệch | Trung bình | Tạo TTS từng câu rồi ghép (offset chính xác), không dùng nhận diện giọng nói để căn chỉnh |
| Thiếu nội dung là rủi ro lớn nhất (app tốt nhưng không có bài để học) | Cao | Làm pipeline nội dung sớm (Phase 1), viết bài song song với code |
| Mất dữ liệu tiến độ (chạy local: hỏng ổ, mất máy, xóa nhầm `data/`) | Trung bình — **chấp nhận tạm thời** vì backup đã hoãn | Nội dung bài học nằm trong git nên không mất; chỉ mất tiến độ cá nhân. Làm backup trước khi lên VPS hoặc khi tiến độ đủ quan trọng (Backlog) |
| Vô tình mở app ra mạng ngoài mà không có đăng nhập | Thấp | Server từ chối khởi động nếu `HOST` không phải localhost mà `AUTH_MODE=none` |
| `better-sqlite3` là native module, có thể lỗi build trên một số máy | Thấp | Ghim phiên bản Node qua `.nvmrc`; dùng prebuilt binary |

## 8. Câu hỏi còn mở (cần anh quyết định)

1. ~~**Deploy ở đâu?**~~ **Đã chốt (2026-10-24):** chạy local trước, lên VPS sau (xem 2.6, Phase 7, Phase 8).
2. ~~**Nhà cung cấp TTS**~~ **Đã chốt (2026-10-24):** Google Cloud TTS, dùng trong hạn mức miễn phí (xem 2.4).
3. ~~**Tra mọi từ**~~ **Đã chốt (2026-10-24):** có ở v1, bằng từ điển riêng soạn bằng Claude trong Cowork (xem 2.5).
4. ~~**Giọng chuẩn**~~ **Đã chốt (2026-10-24):** Anh-Mỹ (`en-US`), IPA theo phát âm Mỹ.
5. ~~**Hosting git**~~ **Đã chốt (2026-10-24):** GitHub (repo private, CI bằng GitHub Actions).

## 9. Backlog (tạm hoãn)

- **Backup DB local:** `npm run backup` dùng SQLite online backup API (an toàn khi app đang chạy), lưu vào `BACKUP_DIR` (gợi ý thư mục iCloud Drive/Dropbox), giữ 14 bản, tự chạy khi `npm start` nếu bản gần nhất cũ hơn 24 giờ. Bắt buộc làm trước Phase 8.
- **Điền sẵn từ điển từ dữ liệu mở:** IPA từ CMUdict, nghĩa tham khảo từ Wiktionary (kaikki.org) cho entry mới → Claude chỉ cần chọn/viết lại nghĩa. Kiểm tra giấy phép (CC BY-SA cho Wiktionary, cần ghi nguồn) trước khi dùng.
- **Tự động hóa tạo entry bằng Gemini API (gói miễn phí)** nếu số bài tăng nhiều và không muốn soạn qua Cowork.

## 10. Nhật ký thay đổi

- 2026-10-24: tạo bản nháp đầu tiên.
- 2026-10-24: chốt chạy local trước, lên VPS sau → thêm `AUTH_MODE` (none/password), tách Phase 7 (local) và Phase 8 (VPS), thêm backup local.
- 2026-10-24: tạm hoãn backup local, chuyển vào Backlog.
- 2026-10-24: chốt TTS là Google Cloud Text-to-Speech; thêm cache, giới hạn ký tự, budget alert, audio phát âm từ.
- 2026-10-24: chốt giọng Anh-Mỹ (IPA kiểu Mỹ) và GitHub (repo private, GitHub Actions CI, pre-commit hook).
- 2026-10-24: chốt tra mọi từ ở v1 bằng từ điển riêng `content/dictionary/` soạn bằng Claude trong Cowork; thêm bảng `word_forms`, `word_senses`, `lesson_tokens`; dữ liệu mở và Gemini đưa vào Backlog.
- 2026-10-24: xong Phase 0 (monorepo, Fastify `/api/health`, Vite React, Vitest, CI, pre-commit); khi dev API chạy ở `PORT` (mặc định 3000), web ở 5173 proxy `/api` sang; chưa push GitHub.
- 2026-10-24: xong Phase 1 (Drizzle + SQLite WAL, migration tự chạy khi khởi động, Zod schema cho `lesson.yaml`/từ điển/`daily-plan.yaml`, tokenizer, `content:sync`/`check-dict`/`stats`, 2 bài mẫu + 130 entry từ điển `draft`); từ viết tắt (`it's`, `I'll`) là entry riêng, `there's` là dạng của `there is`; câu thoại bài nghe chưa có bản dịch tiếng Việt.
- 2026-10-24: xong Phase 2 (tokens.css + Sidebar responsive, React Router + TanStack Query, auth `none`/`password` với argon2 + session cookie + bảng `sessions` + `npm run user:create`, chặn khởi động khi HOST không phải localhost mà `AUTH_MODE=none`, API bài học/trả lời/tiến độ/lưu từ có Zod, trang Bài đọc với `TokenizedText`, WordCard, song ngữ, cỡ chữ, câu hỏi chấm trên server); nút phát âm và "Nghe bài đọc" để tắt chờ Phase 3; lời thoại Bài nghe sẽ dùng `TokenizedText` ở Phase 3.
- 2026-10-24: xong phần code Phase 3: Google TTS qua REST + API key (`GOOGLE_TTS_API_KEY`), provider `fake` (ffmpeg) để test; `content:tts:voices`/`content:tts`/`content:tts-words` có cache (gitignore), `TTS_MAX_CHARS`, `--dry-run`; `timings.json` (offset đo bằng ffprobe + 80 peaks), sync vào DB (migration `0002_audio`), serve `/content` tĩnh có cache 1 năm + `?v=`; trang Bài nghe (player, waveform, lời thoại token hóa, nghe chép, nghe hiểu), "Nghe bài đọc" và nút phát âm WordCard; chọn giọng và chạy TTS thật do người dùng làm trên Mac.
