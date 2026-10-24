import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import type { AuthUser } from '@daily-learning/shared/api';
import { and, asc, eq, gt, isNull, lte } from 'drizzle-orm';
import type { AppDatabase } from '../../db/client.js';
import { sessions, users } from '../../db/schema.js';

/** Sessions last 30 days. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

/**
 * The single local user for `AUTH_MODE=none`: the oldest user without an email.
 * Created on first start.
 */
export function ensureDefaultUser(db: AppDatabase): AuthUser {
  const existing = db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(isNull(users.email))
    .orderBy(asc(users.id))
    .get();
  if (existing) return existing;
  return db.insert(users).values({}).returning({ id: users.id, email: users.email }).get();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Create a password user (argon2id hash). Throws if the email is taken or the password is short. */
export async function createUser(
  db: AppDatabase,
  email: string,
  password: string,
): Promise<AuthUser> {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error(`Invalid email: ${email}`);
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must have at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const taken = db.select({ id: users.id }).from(users).where(eq(users.email, normalized)).get();
  if (taken) throw new Error(`A user with email ${normalized} already exists`);
  const passwordHash = await hash(password);
  return db
    .insert(users)
    .values({ email: normalized, passwordHash })
    .returning({ id: users.id, email: users.email })
    .get();
}

/** Hash used when the email is unknown, so a failed login takes the same time either way. */
let dummyHash: Promise<string> | undefined;

/** Check email + password. Returns the user, or null when they do not match. */
export async function verifyLogin(
  db: AppDatabase,
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const row = db
    .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .get();
  if (!row?.passwordHash) {
    dummyHash ??= hash(randomBytes(16).toString('hex'));
    await verify(await dummyHash, password).catch(() => false);
    return null;
  }
  const ok = await verify(row.passwordHash, password).catch(() => false);
  return ok ? { id: row.id, email: row.email } : null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Create a session and return its token (the cookie value). */
export function createSession(db: AppDatabase, userId: number, now = Date.now()): string {
  const token = randomBytes(32).toString('base64url');
  db.delete(sessions)
    .where(lte(sessions.expiresAt, new Date(now)))
    .run();
  db.insert(sessions)
    .values({ id: hashToken(token), userId, expiresAt: new Date(now + SESSION_TTL_MS) })
    .run();
  return token;
}

/** User of a valid (not expired) session token, or null. */
export function findSessionUser(db: AppDatabase, token: string, now = Date.now()): AuthUser | null {
  const row = db
    .select({ id: users.id, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date(now))))
    .get();
  return row ?? null;
}

export function deleteSession(db: AppDatabase, token: string): void {
  db.delete(sessions)
    .where(eq(sessions.id, hashToken(token)))
    .run();
}
