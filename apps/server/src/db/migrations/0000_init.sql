CREATE TABLE `answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`question_id` integer,
	`dictation_item_id` integer,
	`value` text NOT NULL,
	`correct` integer NOT NULL,
	`answered_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dictation_item_id`) REFERENCES `dictation_items`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "answers_one_target" CHECK(("question_id" is null) <> ("dictation_item_id" is null))
);
--> statement-breakpoint
CREATE INDEX `answers_user_idx` ON `answers` (`user_id`,`answered_at`);--> statement-breakpoint
CREATE TABLE `daily_activity` (
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`seconds_studied` integer DEFAULT 0 NOT NULL,
	`lessons_done` integer DEFAULT 0 NOT NULL,
	`reviews_done` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `daily_plans_template` (
	`day` integer PRIMARY KEY NOT NULL,
	`reading_lesson_id` integer,
	`listening_lesson_id` integer,
	FOREIGN KEY (`reading_lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`listening_lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `dictation_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lesson_id` integer NOT NULL,
	`idx` integer NOT NULL,
	`segment_id` integer NOT NULL,
	`answer` text NOT NULL,
	`before_text` text NOT NULL,
	`after_text` text NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dictation_items_lesson_idx_uq` ON `dictation_items` (`lesson_id`,`idx`);--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`user_id` integer NOT NULL,
	`lesson_id` integer NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`step` integer DEFAULT 0 NOT NULL,
	`score` real,
	`completed_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `lesson_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lesson_tokens` (
	`lesson_id` integer NOT NULL,
	`segment_id` integer NOT NULL,
	`idx` integer NOT NULL,
	`surface` text NOT NULL,
	`start_char` integer NOT NULL,
	`end_char` integer NOT NULL,
	`word_id` integer NOT NULL,
	`sense_id` integer,
	PRIMARY KEY(`segment_id`, `idx`),
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sense_id`) REFERENCES `word_senses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lesson_tokens_lesson_idx` ON `lesson_tokens` (`lesson_id`);--> statement-breakpoint
CREATE TABLE `lesson_words` (
	`lesson_id` integer NOT NULL,
	`word_id` integer NOT NULL,
	`sense_id` integer,
	`idx` integer NOT NULL,
	PRIMARY KEY(`lesson_id`, `word_id`),
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sense_id`) REFERENCES `word_senses`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`level` text NOT NULL,
	`title` text NOT NULL,
	`topic` text NOT NULL,
	`word_count` integer NOT NULL,
	`duration_ms` integer,
	`audio_path` text,
	`cover_path` text,
	`order_index` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lessons_slug_unique` ON `lessons` (`slug`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lesson_id` integer NOT NULL,
	`idx` integer NOT NULL,
	`prompt` text NOT NULL,
	`options` text NOT NULL,
	`correct_idx` integer NOT NULL,
	`feedback_ok` text,
	`feedback_wrong` text,
	`evidence_segment_id` integer,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_segment_id`) REFERENCES `segments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_lesson_idx_uq` ON `questions` (`lesson_id`,`idx`);--> statement-breakpoint
CREATE TABLE `review_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`word_id` integer NOT NULL,
	`rating` integer NOT NULL,
	`reviewed_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`elapsed_days` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "review_logs_rating" CHECK("rating" between 1 and 4)
);
--> statement-breakpoint
CREATE INDEX `review_logs_user_idx` ON `review_logs` (`user_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `segments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lesson_id` integer NOT NULL,
	`key` text NOT NULL,
	`idx` integer NOT NULL,
	`paragraph_idx` integer,
	`speaker` text,
	`text_en` text NOT NULL,
	`text_vi` text,
	`start_ms` integer,
	`end_ms` integer,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `segments_lesson_key_uq` ON `segments` (`lesson_id`,`key`);--> statement-breakpoint
CREATE INDEX `segments_lesson_idx` ON `segments` (`lesson_id`,`idx`);--> statement-breakpoint
CREATE TABLE `user_words` (
	`user_id` integer NOT NULL,
	`word_id` integer NOT NULL,
	`sense_id` integer,
	`source_lesson_id` integer,
	`due` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`scheduled_days` integer DEFAULT 0 NOT NULL,
	`learning_steps` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`last_review` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `word_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`sense_id`) REFERENCES `word_senses`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `user_words_due_idx` ON `user_words` (`user_id`,`due`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text,
	`password_hash` text,
	`level` text DEFAULT 'A2' NOT NULL,
	`daily_goal_min` integer DEFAULT 15 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `word_forms` (
	`form` text PRIMARY KEY NOT NULL,
	`word_id` integer NOT NULL,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `word_forms_word_idx` ON `word_forms` (`word_id`);--> statement-breakpoint
CREATE TABLE `word_senses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`word_id` integer NOT NULL,
	`key` text NOT NULL,
	`idx` integer NOT NULL,
	`pos` text NOT NULL,
	`meaning_vi` text NOT NULL,
	`definition_en` text NOT NULL,
	`collocations` text NOT NULL,
	`example` text NOT NULL,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `word_senses_word_key_uq` ON `word_senses` (`word_id`,`key`);--> statement-breakpoint
CREATE TABLE `words` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lemma` text NOT NULL,
	`ipa_us` text NOT NULL,
	`cefr` text NOT NULL,
	`oxford3000` integer NOT NULL,
	`is_phrase` integer DEFAULT false NOT NULL,
	`status` text NOT NULL,
	`audio_path` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `words_lemma_unique` ON `words` (`lemma`);