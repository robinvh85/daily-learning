# DailyLearning — Kế hoạch thêm phần Ngữ pháp

> Ngày lập: 2026-11-14 · Trạng thái: **Bản đề xuất, chờ anh chốt các quyết định ở mục 9**
> Liên quan: [`dailylearning-v1-plan.md`](dailylearning-v1-plan.md) (format bài học, từ điển, daily plan)

## 1. Mục tiêu

- Người học A2 → B1 nắm được **khoảng 30 điểm ngữ pháp cốt lõi**, mỗi ngày học thêm ~5 phút, tổng
  thời gian một ngày vẫn quanh 15–20 phút.
- Ngữ pháp **không tách rời** nội dung đã đọc/nghe: mỗi điểm ngữ pháp được giới thiệu bằng câu thật
  trong bài của ngày hôm đó.
- Có chỗ tra lại khi cần (thư viện ngữ pháp), và có cách ôn để không quên.

## 2. So sánh các cách học

| | A. Bài ngữ pháp riêng | B. Ghép vào bài đọc/nghe | **C. Lai: điểm ngữ pháp của ngày, gắn với bài (đề xuất)** |
|---|---|---|---|
| Cách làm | Mục "Ngữ pháp" độc lập, học theo giáo trình: quy tắc → ví dụ → bài tập | Trong bài đọc, đánh dấu câu có cấu trúc, bấm vào xem giải thích ngắn; không có bài tập riêng | Mỗi ngày có 1 điểm ngữ pháp. Bài đọc/nghe đánh dấu câu mẫu; sau đó là bước **Ngữ pháp** (~5 phút): nhận ra → quy tắc → luyện tập. Có thư viện để tra lại |
| Ngữ cảnh | Câu ví dụ rời rạc, dễ quên | Rất tốt, câu đã đọc và hiểu nghĩa | Tốt: ví dụ đầu tiên luôn lấy từ bài vừa học |
| Tính hệ thống | Tốt, đủ điểm theo lộ trình | Kém: chỉ học được thứ tình cờ có trong bài, thiếu luyện tập | Tốt: lộ trình ngữ pháp định trước, bài mới viết có chủ đích |
| Luyện tập | Có | Không (hoặc rất ít) | Có, chấm ngay |
| Công soạn nội dung | Trung bình | Thấp | Trung bình (thêm file ngữ pháp + chú thích trong `lesson.yaml`) |
| Công code | Trang mới + bài tập | Chỉ thêm highlight + popup | Cả hai, nhưng tái dùng được Quiz, WordCard, TokenizedText |
| Rủi ro | Cảm giác "học giáo trình", bỏ ngang | Không đủ để thật sự dùng đúng ngữ pháp | Ngày học dài thêm ~5 phút |

**Đề xuất: phương án C.** Lý do:

1. Người học A2 nhớ quy tắc tốt nhất khi **gặp nó trong câu đã hiểu nghĩa trước** (học kiểu
   "nhận ra rồi mới học quy tắc"). Bài đọc của ngày là nguồn câu sẵn có, không tốn thêm công viết ví dụ.
2. Chỉ ghép vào bài đọc (B) thì không có luyện tập, và lộ trình phụ thuộc vào việc bài tình cờ có
   cấu trúc gì. Bản quét 30 bài hiện có (mục 6) cho thấy gần như **chưa có hiện tại hoàn thành và so
   sánh hơn** — là hai điểm quan trọng của B1.
3. App đã có sẵn hầu hết thành phần: `Quiz` (trắc nghiệm chấm ngay), `Dictation` (điền chỗ trống),
   `TokenizedText` (đánh dấu từ trong câu), `WordCard` (popup), daily plan theo ngày.

## 3. Trải nghiệm người học

### 3.1 Một ngày học

```mermaid
flowchart LR
  R[Đọc<br/>câu mẫu được đánh dấu] --> L[Nghe]
  L --> G[Ngữ pháp ~5'<br/>Nhận ra → Quy tắc → Luyện tập]
  G --> V[Ôn từ vựng<br/>+ vài câu ôn ngữ pháp đến hạn]
```

- Trang chủ, khối "Bài học hôm nay" có thêm một bước **Ngữ pháp** giữa Nghe và Ôn từ.
- Bước Ngữ pháp mở được bất cứ lúc nào (không khóa sau Đọc/Nghe), nhưng ví dụ hay nhất khi đã đọc bài.

### 3.2 Trong bài đọc / bài nghe

- Thanh công cụ có nút bật/tắt **"Ngữ pháp trong bài"** (mặc định bật ở bài thuộc ngày có điểm ngữ pháp).
- Khi bật: phần cấu trúc trong câu mẫu được gạch chân màu khác với từ trọng tâm (ví dụ `opened`,
  `worked` trong "Last week, a small coffee shop **opened** on my street").
- Bấm vào phần gạch chân → **GrammarCard** (giống WordCard): tên điểm ngữ pháp, công thức một dòng,
  giải thích ngắn bằng tiếng Việt cho đúng câu này, nút "Học điểm này" mở trang ngữ pháp.
- Bài nghe: chỉ đánh dấu trong lời thoại khi đã hiện lời thoại, không làm lộ đáp án nghe chép.

### 3.3 Trang ngữ pháp `/grammar/:slug` — 3 bước (giống cách chia bước của trang Đọc)

| Bước | Nội dung | Thành phần dùng lại |
|---|---|---|
| 1. Nhận ra | 3–4 câu lấy từ bài đọc/nghe của ngày, phần cấu trúc được tô đậm; một câu hỏi gợi ý ("Các động từ tô đậm có gì chung?") rồi mới hiện đáp án. Mỗi câu có link về đúng câu trong bài | `TokenizedText`, link `?seg=p1s1` |
| 2. Quy tắc | Bảng công thức (khẳng định / phủ định / nghi vấn), cách dùng, dấu hiệu nhận biết, **lỗi người Việt hay mắc** (ví dụ quên `-s` ngôi thứ ba, "I am agree"). Câu ví dụ có audio TTS | Bảng markdown, `AudioPlayer` nhỏ |
| 3. Luyện tập | 6–8 câu, chấm ngay, có giải thích khi sai. Các dạng: trắc nghiệm chọn dạng đúng, điền dạng đúng của động từ, sắp xếp từ thành câu, tìm câu sai | `Quiz`, `Dictation` (mở rộng), component mới `WordOrder` |

Hoàn thành bước 3 (làm hết câu, không bắt buộc đúng hết) = hoàn thành điểm ngữ pháp, giống cách
bài đọc hoàn thành khi trả lời xong câu hỏi.

### 3.4 Thư viện `/grammar`

- Mục mới **Ngữ pháp** trên Sidebar (giữa Nghe và Từ vựng).
- Danh sách theo cấp (A2 / A2+ / B1) và nhóm (Thì, Động từ khuyết thiếu, So sánh, Câu…), trạng thái
  Chưa học / Đang học / Đã học, điểm luyện tập gần nhất.
- Mỗi điểm ngữ pháp liệt kê "Gặp trong bài": các bài có câu được chú thích điểm đó.

### 3.5 Ôn ngữ pháp (phase sau, tùy chọn)

- Mỗi điểm ngữ pháp đã học là **một thẻ FSRS** (dùng lại `ts-fsrs` như thẻ từ).
- Đến hạn → trong màn Ôn từ vựng có thêm 3 câu luyện tập ngẫu nhiên của điểm đó. Mức đánh giá suy ra
  từ kết quả: 3/3 đúng = Dễ, 2/3 = Nhớ, 1/3 = Khó, 0/3 = Quên. Không bắt người học tự chấm.

## 4. Định dạng nội dung

### 4.1 Điểm ngữ pháp: `content/grammar/<slug>.yaml`

```yaml
slug: past-simple-regular
title: Quá khứ đơn – động từ có quy tắc
title_en: Past simple (regular verbs)
level: A2
group: tenses              # tenses | modals | comparison | sentence | nouns | verbs-patterns
summary: Dùng cho việc đã xảy ra và kết thúc trong quá khứ. Động từ thêm -ed.
discover:
  question: Các động từ tô đậm trong 3 câu trên có gì chung? Chúng nói về lúc nào?
  answer: Đều thêm -ed và nói về việc đã xong trong quá khứ (last week, for five years).
  # Câu mẫu lấy tự động từ các bài có chú thích `grammar` trỏ tới slug này (mục 4.2),
  # ưu tiên bài của cùng ngày. Có thể ghim thêm bằng `pinned: [a-new-coffee-shop#p1s1]`.
form:
  - label: Khẳng định
    pattern: S + V-ed
    example: She worked in a hotel.
  - label: Phủ định
    pattern: S + did not (didn't) + V
    example: She didn't work in a bank.
  - label: Nghi vấn
    pattern: Did + S + V?
    example: Did she work in a hotel?
usage:
  - Việc đã xảy ra và kết thúc tại một thời điểm trong quá khứ.
signals: [yesterday, last week, ago, in 2020]
spelling:
  - 'Tận cùng -e: chỉ thêm -d (live → lived)'
  - 'Phụ âm + y: đổi y → ied (study → studied)'
  - 'Nguyên âm ngắn + phụ âm: gấp đôi (stop → stopped)'
common_mistakes:
  - wrong: Did she worked in a hotel?
    right: Did she work in a hotel?
    why: Sau did, động từ trở về nguyên mẫu.
exercises:
  - type: choice
    prompt: Last year we ___ to a new apartment.
    options: [move, moved, moving]
    correct: 1
    explain: '"Last year" là quá khứ → moved.'
  - type: gap                # điền dạng đúng của động từ trong ngoặc
    prompt: She ___ (not / like) the hotel food.
    answer: didn't like
    accept: [did not like]
  - type: order              # sắp xếp từ
    words: [you, did, the, call, landlord]
    answer: Did you call the landlord?
  - type: find_error
    sentence: I watch a film with my friends yesterday.
    wrong: watch
    right: watched
status: draft              # draft | reviewed
```

- Schema Zod mới `grammarPointSchema` trong `packages/shared/src/content.ts`, kiểu riêng cho từng
  loại bài tập (`choice | gap | order | find_error`) bằng `z.discriminatedUnion('type', …)`.
- Câu ví dụ trong `form`, `exercises` dùng từ đã có trong từ điển → bấm được vào từ như bài đọc
  (kiểm bằng `content:check-dict`, cảnh báo chứ không báo lỗi).

### 4.2 Chú thích trong bài: `lesson.yaml`

```yaml
grammar:
  - point: past-simple-regular
    segment: p1s1
    match: opened              # phần được gạch chân; phải xuất hiện trong text_en của segment
  - point: past-simple-regular
    segment: p1s4
    match: worked
    note: '"for five years" + quá khứ đơn: việc kéo dài nhưng đã kết thúc.'   # tùy chọn, hiện trong GrammarCard
```

- `match` có thể là cụm không liền nhau bằng `…`: `match: "is … going to"`.
- Validate: `point` phải tồn tại trong `content/grammar/`, `match` phải tìm thấy trong segment.

### 4.3 Lộ trình: `content/daily-plan.yaml`

```yaml
  - day: 2
    title: Công việc mới
    reading: my-first-week-at-a-new-job
    listening: introducing-yourself-at-work
    grammar: past-simple-regular      # tùy chọn; ngày không có thì bỏ qua bước Ngữ pháp
```

### 4.4 Build

- `npm run content:build` đọc thêm `content/grammar/`, ghi vào `catalog.json` danh sách điểm ngữ pháp
  (slug, title, level, group, số bài liên quan) và một file `grammar/<slug>.json` cho mỗi điểm (giống
  cách đang tách `LessonData`).
- Script mới `npm run content:check-grammar [slug]`:
  - liệt kê chú thích `grammar` lỗi (point không tồn tại, `match` không khớp);
  - với mỗi điểm trong lộ trình, đếm số câu mẫu trong bài của ngày đó, cảnh báo nếu < 2;
  - gợi ý câu có thể chú thích (regex theo từng điểm, ví dụ `\b(have|has) \w+ed\b`) để soạn nhanh.
- CI (`content:build --dry-run`) báo lỗi khi validate hỏng, giống từ điển.

## 5. Dữ liệu người học (Firestore) và code

### 5.1 Firestore

```
users/{uid}/grammarProgress/{slug}
  status: not_started | in_progress | completed
  step: 0 | 1 | 2
  lastScore: int            # số câu đúng lần làm gần nhất
  total: int
  completedAt: timestamp | null
  updatedAt: timestamp
  # phase ôn (3.5): thêm các trường thẻ FSRS, dùng lại hàm isCard() trong firestore.rules
```

- Thêm rule cho `grammarProgress/{slug}` trong `firestore.rules` (cùng kiểu `lessonProgress`), có test emulator.
- Câu trả lời từng bài tập ghi vào collection `answers` sẵn có (thêm trường `grammar: slug`), để
  thống kê câu hay sai.

### 5.2 Các file chính sẽ đụng

| Khu vực | File |
|---|---|
| Schema / type | `packages/shared/src/content.ts`, `content-data.ts`, `api.ts` (`TodayStepDto.kind` thêm `'grammar'`), `constants.ts` (`GRAMMAR_GROUPS`) |
| Build / check | `scripts/content-build.ts`, `scripts/content-grammar-check.ts` (mới), `scripts/content-stats.ts` |
| Backend (chạy trong web) | `apps/web/src/backend/content.ts`, `handlers.ts`, `router.ts`, `userStore.ts`, `logic/dailyPlan.ts` (`PlanDay.grammarSlug`, `grammarStep()`) |
| UI | `pages/Grammar/GrammarPage.tsx` + `GrammarLibraryPage.tsx` (mới), `components/GrammarCard/`, `components/WordOrder/` (mới), `components/TokenizedText` (thêm lớp gạch chân ngữ pháp), `pages/Reading/ReadingPage.tsx`, `pages/Listening/ListeningPage.tsx`, `pages/Home/HomePage.tsx`, `components/Sidebar/Sidebar.tsx`, `App.tsx` |
| Rules / test | `firestore.rules`, `apps/web/test/*`, `apps/web/test/emulator/*`, `e2e/learning-flow.spec.ts` |

### 5.3 Ảnh hưởng tới "ngày đã xong"

Hiện `pickToday` coi một ngày xong khi bài đọc và bài nghe xong. Có hai lựa chọn (anh chốt ở mục 9):

- **(a) Ngữ pháp bắt buộc:** ngày chỉ xong khi cả Ngữ pháp xong → người đang ở giữa lộ trình (đã
  qua ngày 1–15) sẽ bị kéo về ngày 1 nếu không xử lý. Cần quy tắc chuyển tiếp: ngày đã xong trước khi
  có ngữ pháp vẫn tính là xong, điểm ngữ pháp của các ngày đó hiện ở thư viện như "chưa học".
- **(b) Ngữ pháp tùy chọn (đề xuất cho bước đầu):** ngày xong như cũ; bước Ngữ pháp hiện trên trang
  chủ nhưng không chặn sang ngày mới. Không phải sửa logic chuyển ngày, không ảnh hưởng streak.

## 6. Lộ trình ngữ pháp (bản nháp)

### 6.1 Ngày 1–15: gán vào bài đã có

Bảng dưới dựa trên bản quét regex 30 bài hiện có (đếm thô, sẽ kiểm lại bằng
`content:check-grammar` ở Phase 1). Cột cuối là số câu mẫu ước tính trong bài của ngày đó.

| Ngày | Chủ đề | Điểm ngữ pháp | Câu mẫu có sẵn |
|---|---|---|---|
| 1 | Cuộc sống quanh khu phố | Hiện tại đơn + trạng từ tần suất (usually, always, sometimes) | Có ("I usually go there…") |
| 2 | Công việc mới | Quá khứ đơn – động từ có quy tắc | Nhiều (~9 trong bài đọc) |
| 3 | Ăn uống | Danh từ đếm được / không đếm được; some / any | Cần kiểm |
| 4 | Mua sắm | `will` cho quyết định tức thì, đề nghị ("I'll take it") | Ít (2) — có thể bổ sung 1–2 câu vào bài |
| 5 | Sức khỏe | Lời khuyên và bắt buộc: `should`, `have to` | Ít — có thể bổ sung |
| 6 | Du lịch | Quá khứ đơn – động từ bất quy tắc | Rất nhiều (~20) |
| 7 | Giao tiếp ở công ty | `can / could` để xin phép, nhờ lịch sự | Có |
| 8 | Cuối tuần | Kế hoạch tương lai: `be going to` và hiện tại tiếp diễn | Có |
| 9 | Công nghệ | `can / can't` – khả năng; `how to` | Nhiều (can ~5) |
| 10 | Tiền bạc | `how much / how many`, `a lot of / much / many` | Cần kiểm |
| 11 | Gia đình | So sánh hơn và so sánh nhất | Ít (1–2) — cần bổ sung |
| 12 | Thời tiết | `will` dự đoán + câu điều kiện loại 1 | Có (will ~3, if) |
| 13 | Nhà ở | Hiện tại đơn và hiện tại tiếp diễn | Có (~3) |
| 14 | Thể thao và sở thích | Động từ + V-ing (like, enjoy, start, stop) | Cần kiểm |
| 15 | Học tập | **Ôn tập tổng hợp** ngày 1–14 (bài luyện trộn, không có quy tắc mới) | — |

Nguyên tắc: điểm nào có dưới 2 câu mẫu thì **sửa nhẹ bài cũ** (thêm 1–2 câu tự nhiên) thay vì đổi
điểm ngữ pháp. Sửa câu kéo theo tạo lại audio (`content:tts` có cache theo câu nên chỉ tốn ký tự của
câu mới) và cập nhật `timings.json`.

### 6.2 Ngày 16–30 trở đi: viết bài mới có chủ đích (hướng B1)

Từ đây **chọn điểm ngữ pháp trước, viết bài sau**: khi soạn `lesson.yaml` mới, đưa vào yêu cầu
"bài đọc dùng tự nhiên 3–5 câu với cấu trúc X", rồi chú thích `grammar` luôn.

Danh sách đề xuất (theo thứ tự): quá khứ tiếp diễn · hiện tại hoàn thành (ever / never) · hiện tại
hoàn thành với for / since · hiện tại hoàn thành và quá khứ đơn · `used to` · mệnh đề quan hệ
who / which / that · bị động hiện tại và quá khứ · `might / may` (khả năng) · `too / enough` · động
từ + to V và động từ + V-ing · câu điều kiện loại 2 · câu tường thuật cơ bản (said / told) · mạo từ
a / an / the · đại từ bất định (something, anyone…) · ôn tập.

## 7. Các phase

| Phase | Nội dung | Xong khi |
|---|---|---|
| **1. Nội dung và schema** | `grammarPointSchema`, chú thích `grammar` trong `lessonSchema`, `grammar` trong daily plan; `content:build` ghi catalog + file từng điểm; `content:check-grammar`. Soạn thử 3 điểm (ngày 1, 2, 6) | `content:build` xanh, test schema (Vitest) cho từng loại bài tập và lỗi validate |
| **2. Trang ngữ pháp** | `/grammar/:slug` 3 bước, component `WordOrder`, mở rộng chấm điền chỗ trống (dùng lại `normalizeDictation`); `/grammar` thư viện; mục Sidebar | Test component + axe; chạy thật trên dev server 3 điểm thử |
| **3. Gắn vào bài đọc / nghe** | Gạch chân trong `TokenizedText`, `GrammarCard`, nút bật/tắt; link câu mẫu → đúng câu trong bài | Test ReadingPage/ListeningPage; đáp án nghe chép không bị lộ |
| **4. Tiến độ và trang chủ** | `grammarProgress` + rules + test emulator; bước Ngữ pháp trong "Bài học hôm nay" theo lựa chọn 5.3; thống kê trên trang chủ | Test emulator rules, `dailyPlan` unit test, E2E thêm bước Ngữ pháp vào `learning-flow.spec.ts` |
| **5. Soạn đủ nội dung ngày 1–15** | 14 điểm + bài ôn tập; chú thích câu mẫu; bổ sung câu cho ngày ít ví dụ; TTS câu ví dụ | `content:check-grammar` không còn cảnh báo cho ngày 1–15; anh duyệt `status: reviewed` |
| **6. Ôn ngữ pháp bằng FSRS** (tùy chọn) | Thẻ FSRS cho mỗi điểm; câu ôn trộn vào màn Ôn từ vựng | Unit test chấm điểm → rating; E2E một lượt ôn |

Phase 1–4 là phần code (làm trước, mỗi phase một commit / MR). Phase 5 làm song song với việc viết
bài cho ngày 16+ theo quy trình soạn bài hiện tại (Claude soạn → check → duyệt).

**Quy trình soạn một điểm ngữ pháp (bổ sung vào quy trình ở plan v1, mục 2.5)**

```mermaid
flowchart TD
  A[Chọn điểm ngữ pháp cho ngày] --> B{Bài của ngày có >= 2 câu mẫu?}
  B -- Có --> C[Thêm chú thích grammar vào lesson.yaml]
  B -- Không --> D[Sửa nhẹ bài: thêm 1-2 câu<br/>chạy lại content:tts] --> C
  C --> E[Viết content/grammar/slug.yaml<br/>status: draft]
  E --> F[content:check-grammar + content:check-dict]
  F --> G[Duyệt → status: reviewed] --> H[content:build]
```

## 8. Ước tính khối lượng

- Code Phase 1–4: khoảng 4–6 phiên làm việc (giả định, đo lại sau Phase 1).
- Nội dung: một điểm ngữ pháp ~1,5–2 KB YAML, 6–8 bài tập. 15 điểm ngày 1–15 ≈ 30 KB.
- TTS câu ví dụ: ~15 điểm × ~10 câu × ~50 ký tự ≈ 7.500 ký tự, nằm trong hạn mức miễn phí.

## 9. Quyết định cần anh chốt

| # | Câu hỏi | Đề xuất |
|---|---|---|
| 1 | Cách học: A / B / C | **C** (điểm ngữ pháp của ngày, gắn với bài) |
| 2 | Bước Ngữ pháp có bắt buộc để hoàn thành ngày không (mục 5.3) | **Tùy chọn** ở bước đầu, xem lại sau 2 tuần dùng thử |
| 3 | Ngôn ngữ giải thích | **Tiếng Việt**, thuật ngữ kèm tên tiếng Anh trong ngoặc (Quá khứ đơn – Past simple) |
| 4 | Có làm Phase 6 (ôn bằng FSRS) không | Có, nhưng **sau** khi Phase 1–5 dùng ổn |
| 5 | Được sửa nhẹ bài cũ để đủ câu mẫu không (mục 6.1) | Có, tối đa 2 câu / bài, giữ nguyên câu hỏi và nghe chép |
| 6 | Danh sách điểm ngữ pháp ngày 1–15 (mục 6.1) | Anh xem và đổi nếu muốn, đặc biệt ngày 3, 10, 14 (chưa chắc có đủ câu mẫu) |
