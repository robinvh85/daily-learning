# DailyLearning

Web app học tiếng Anh ~15 phút mỗi ngày, tập trung **Đọc** và **Nghe** (A2 → B1). Chạy local trên
máy cá nhân: một process Node phục vụ cả API và giao diện. Kế hoạch đầy đủ:
[`.claude/plans/dailylearning-v1-plan.md`](.claude/plans/dailylearning-v1-plan.md).

## Yêu cầu

- **Node.js 22** qua [nvm](https://github.com/nvm-sh/nvm): `nvm install` rồi `nvm use` (đọc `.nvmrc`).
- **ffmpeg** (chỉ cần khi tạo audio): `brew install ffmpeg` (có kèm `ffprobe`).

## Chạy lần đầu trên Mac

```bash
nvm use
rm -rf node_modules && npm install   # bắt buộc: node_modules hiện có được cài từ sandbox Linux
cp -n .env.example .env              # chỉ tạo nếu chưa có; mặc định đã dùng được
npm run build && npm start
```

Mở **http://127.0.0.1:3000**. Khi khởi động, server tự chạy migration cho `data/app.db` và tự nạp
nội dung bài học (xem [Nội dung tự đồng bộ](#nội-dung-tự-đồng-bộ)), nên clone mới chỉ cần 3 lệnh trên.

Phát triển (sửa code, tự reload): `npm run dev` → web http://127.0.0.1:5173 (Vite, proxy `/api` và
`/content` sang server ở cổng `PORT`).

## Dùng hằng ngày

```bash
npm start            # mở http://127.0.0.1:3000 rồi học: Đọc → Nghe → Ôn từ
```

Sau `git pull` có bài mới: `npm run build && npm start` (nội dung tự sync khi thay đổi). Muốn app tự
chạy khi đăng nhập macOS, xem [Tự khởi động bằng launchd](#tự-khởi-động-bằng-launchd-tùy-chọn).

## Lệnh

| Lệnh                                | Tác dụng                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`                       | Server (tsx watch) + web (Vite) cùng lúc                                            |
| `npm run build`                     | Build `shared`, `server`, `web` vào các thư mục `dist/`                             |
| `npm start`                         | Chạy bản build tại `HOST:PORT` (mặc định http://127.0.0.1:3000)                     |
| `npm run lint` / `typecheck`        | ESLint / `tsc --noEmit` (mọi workspace + `e2e/`)                                    |
| `npm test`                          | Vitest (server + web, gồm kiểm tra a11y bằng axe-core)                              |
| `npm run test:e2e`                  | Build rồi chạy Playwright (luồng Đọc → Nghe → Ôn từ), DB tạm ở `tmp/e2e/`           |
| `npm run format`                    | Prettier (ghi); `format:check` chỉ kiểm tra                                         |
| `npm run db:migrate`                | Áp migration vào `DB_PATH` (server cũng tự chạy khi khởi động)                      |
| `npm run db:generate`               | Tạo migration mới sau khi sửa `apps/server/src/db/schema.ts`                        |
| `npm run content:sync`              | Validate `content/` và nạp vào SQLite (`-- --dry-run`: chỉ validate, dùng trong CI) |
| `npm run content:check-dict [slug]` | Từ trong bài chưa có trong từ điển, từ nhiều nghĩa chưa chọn nghĩa                  |
| `npm run content:stats`             | Số entry, % `reviewed`, độ phủ Oxford 3000, số bài                                  |
| `npm run content:tts:voices`        | Liệt kê giọng en-US (`-- --sample`: file nghe thử trong `tmp/voice-samples/`)       |
| `npm run content:tts -- <slug>`     | Audio bài: `audio.mp3` + `timings.json` (`--all`, `--dry-run`, `--force`)           |
| `npm run content:tts-words`         | Phát âm từ `content/words/<lemma>.mp3` cho từ chưa có audio                         |
| `npm run user:create -- <email>`    | Tạo tài khoản cho `AUTH_MODE=password`                                              |

## Cấu trúc thư mục

```
apps/
  server/        Fastify API + serve bản build web (src/app.ts, src/index.ts), test trong test/
  web/           React 18 + Vite (pages/, components/, api/, styles/tokens.css), test trong test/
packages/shared/ Zod schema + type dùng chung
content/
  lessons/<level>/<slug>/   lesson.yaml (+ audio.mp3, timings.json khi đã tạo audio)
  dictionary/<lemma>.yaml   từ điển riêng, mỗi từ gốc / cụm từ một file
  words/<lemma>.mp3         audio phát âm từ
  daily-plan.yaml           lộ trình: ngày N → bài đọc + bài nghe
  tts.config.yaml           giọng đọc cho content:tts
e2e/             Playwright (luồng chính)
scripts/         content-*.ts, tts*.ts, db-migrate.ts, user-create.ts, launchd/
data/            app.db — tiến độ cá nhân, KHÔNG commit (.gitignore)
```

## AUTH_MODE

Cấu hình trong `.env` (xem `.env.example`):

- `AUTH_MODE=none` (mặc định, dùng local): không có màn hình đăng nhập, mọi request gắn vào một user
  mặc định. Server chỉ nghe ở `HOST=127.0.0.1`, máy khác trong mạng không vào được.
- `AUTH_MODE=password`: bắt buộc đăng nhập (mật khẩu hash argon2, cookie phiên httpOnly). Tạo tài
  khoản bằng `npm run user:create -- you@example.com`. Dùng khi muốn mở app ra mạng (VPS, hoặc học
  bằng điện thoại cùng Wi-Fi với `HOST=0.0.0.0`).
- Server **từ chối khởi động** nếu `HOST` không phải localhost mà `AUTH_MODE=none`.

Các biến khác: `PORT` (3000), `DB_PATH` (`./data/app.db`), `USER_DISPLAY_NAME` (tên trong lời chào).

## Nội dung tự đồng bộ

Khi `npm start`, server tính một hash (SHA-256) của các file trong `content/` mà `content:sync` đọc
(toàn bộ nội dung `*.yaml` và `timings.json`; tên + kích thước + thời gian sửa của `*.mp3`/ảnh) và so
với hash lưu trong bảng `app_meta` ở lần sync thành công gần nhất:

- DB chưa có bài nào, hoặc hash khác → chạy sync (~1–2 giây), lưu hash mới.
- Hash giống → bỏ qua (chỉ tốn thời gian đọc file, vài trăm ms).
- Nội dung lỗi → ghi log lỗi, app vẫn chạy với dữ liệu cũ; chạy `npm run content:sync` để xem chi tiết.

`npm run content:sync` cũng lưu hash, nên lần `npm start` sau không sync lại.

## Thêm bài học mới

Quy trình soạn bài (kế hoạch mục 2.5):

1. Viết `content/lessons/a2/<slug>/lesson.yaml` (bài, bản dịch, câu hỏi, nghe chép, focus words,
   `senses`, `ignore`) và thêm bài vào `content/daily-plan.yaml` nếu muốn đưa vào lộ trình.
2. `npm run content:check-dict <slug>` → liệt kê token chưa có trong từ điển và từ nhiều nghĩa chưa
   được chọn nghĩa.
3. Tạo các file `content/dictionary/<lemma>.yaml` còn thiếu (`status: draft`), chọn nghĩa đúng câu
   trong bài (`senses: { run: manage }`, lần xuất hiện thứ 2: `run#2: move`).
4. Duyệt lại → đổi sang `status: reviewed`.
5. `npm run content:tts -- <slug>` và `npm run content:tts-words` (mục dưới), rồi
   `npm run content:sync` (hoặc chỉ cần `npm start`).
6. `npm run content:sync -- --dry-run` phải báo OK trước khi commit (CI cũng chạy lệnh này).

Schema: `packages/shared/src/content.ts`. Quy tắc tách từ: `apps/server/src/content/tokenizer.ts`
(cụm dài nhất trước, dạng từ → từ gốc, `ignore`, bỏ qua số; từ viết tắt như `it's` / `I'll` là entry
riêng, `there's` là dạng của `there is`).

## Tạo audio (chạy trên Mac)

Audio tạo một lần bằng Google Cloud Text-to-Speech (kế hoạch 2.4) rồi commit vào git; app không gọi
TTS khi đang học. Cần `GOOGLE_TTS_API_KEY` trong `.env` (API key chỉ cho phép Text-to-Speech API).
Trước lần chạy đầu, đặt **budget alert** trong Google Cloud Billing (ví dụ 1 USD).

Chạy theo thứ tự:

```bash
brew install ffmpeg                          # ffmpeg + ffprobe (script kiểm tra lúc bắt đầu)

npm run content:tts:voices -- --sample       # liệt kê giọng + 8 file nghe thử trong tmp/voice-samples/
open tmp/voice-samples                       # nghe rồi sửa content/tts.config.yaml
                                             # (speakerA, speakerB, narrator, word)

npm run content:tts -- --all --dry-run       # chỉ đếm ký tự, không gửi gì
npm run content:tts -- --all                 # audio.mp3 + timings.json cạnh mỗi lesson.yaml

npm run content:tts-words -- --dry-run       # tùy chọn: đếm trước
npm run content:tts-words                    # content/words/<lemma-slug>.mp3

npm run content:sync                         # timings, thời lượng, waveform, audio từ → SQLite

git add content && git commit -m "content: add lesson and word audio"
```

Cách hoạt động:

- Mỗi câu một clip (giọng A/B cho bài nghe, giọng `narrator` cho bài đọc), ghép bằng ffmpeg với
  `gapMs` khoảng lặng, chuẩn hóa MP3 mono 64 kbps. `timings.json` chứa mốc từng câu (đo bằng ffprobe),
  thời lượng và 80 điểm waveform.
- Mỗi lần chạy in số ký tự sẽ gửi và dừng trước khi gọi API nếu vượt `TTS_MAX_CHARS` (mặc định
  50000). `--dry-run` chỉ in số ký tự (không cần key, không cần ffmpeg).
- Cache: `content/.tts-cache.json` + `content/.tts-clips/` (đều gitignore). Clip đã có không gửi lại.
  Bài có `timings.json` khớp nội dung được bỏ qua; đổi giọng thì dùng `--force` (chỉ tạo lại clip của
  giọng mới).
- Giọng Chirp 3 HD chỉ nhận văn bản thường và bỏ qua `speakingRate`; Neural2 và WaveNet dùng
  `speakingRate` trong `content/tts.config.yaml`. Tên giọng được kiểm tra với danh sách của Google
  trước khi tạo.
- Thử không cần Google: `--provider fake --out <thư mục tạm>` ghi âm thử bằng ffmpeg vào bản sao
  `content/` trong thư mục đó (không bao giờ ghi vào `content/` của repo).
- Server chỉ phục vụ `*.mp3`, ảnh bìa và `timings.json` từ `content/` dưới `/content/` (không bao giờ
  YAML hay cache), cache 1 năm; URL từ API có `?v=<hash file>`.

## Kiểm thử

- `npm test`: unit + API (server), component + kiểm tra a11y tự động bằng axe-core (web, jsdom).
- `npm run test:e2e` (chạy trên Mac): lần đầu cài trình duyệt bằng `npx playwright install chromium`.
  Lệnh build app, khởi động server ở cổng 3100 với DB tạm `tmp/e2e/app.db` (xóa mỗi lần chạy, không
  đụng `data/app.db`) và chạy luồng: Trang chủ → bài đọc (bấm từ, lưu từ, trả lời câu hỏi) → bài
  nghe (lời thoại, nghe chép) → Ôn từ (lật thẻ, chấm, badge giảm). Báo cáo: `npx playwright show-report`.
  E2E không nằm trong `npm test` và CI.

## Tự khởi động bằng launchd (tùy chọn)

1. Sửa đường dẫn `/Users/YOU/...` trong `scripts/launchd/com.dailylearning.plist.example`.
2. `cp scripts/launchd/com.dailylearning.plist.example ~/Library/LaunchAgents/com.dailylearning.plist`
3. `launchctl load ~/Library/LaunchAgents/com.dailylearning.plist` → app chạy ngay và mỗi lần đăng nhập.
4. Log: `~/Library/Logs/dailylearning.log`. Sau khi build lại: `launchctl kickstart -k gui/$(id -u)/com.dailylearning`.
5. Gỡ: `launchctl unload ~/Library/LaunchAgents/com.dailylearning.plist` rồi xóa file plist.

## Xử lý sự cố

- **`better-sqlite3` lỗi native module** (`was compiled against a different Node.js version`,
  `invalid ELF header`, `NODE_MODULE_VERSION`…): `node_modules` cài cho máy/phiên bản Node khác. Chạy
  `nvm use && rm -rf node_modules && npm install`.
- **Cổng đang bị dùng** (`EADDRINUSE`): xem process bằng `lsof -i :3000`, tắt nó, hoặc đặt `PORT=3001`
  trong `.env`. Nếu đã cài launchd, app có thể đang chạy sẵn.
- **Thiếu ffmpeg** (`ffmpeg not found` khi chạy `content:tts`): `brew install ffmpeg`, kiểm tra bằng
  `ffmpeg -version` và `ffprobe -version`.
- **Mở http://127.0.0.1:3000 chỉ thấy JSON 404**: chưa build web → `npm run build`.
- **Bài mới không hiện**: xem log khởi động (`content sync failed …`) hoặc chạy `npm run content:sync`.

## Pre-commit hook

Chạy ESLint + Prettier cho file được stage và chặn:

- file media (mp3, webp, png, jpg, …) lớn hơn 5 MB
- file `*.json` chứa `private_key` (key service account để trong `secrets/`, đã gitignore)
