/**
 * Empty the emulators and create two Google accounts in the Auth emulator: `E2E_USER`, given
 * access like `npm run user:grant` does (`learner` claim), and `STRANGER`, who can sign in with
 * Google but has no access.
 */
export const E2E_USER = { email: 'e2e@example.com', name: 'E2E' };
export const STRANGER = { email: 'stranger@example.com', name: 'Stranger' };

const PROJECT = 'demo-daily-learning';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8180';

async function call<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url}: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** A Google account in the Auth emulator (it accepts an unsigned JSON id_token). */
async function googleAccount(u: { email: string; name: string }): Promise<string> {
  const idToken = JSON.stringify({
    sub: u.email,
    email: u.email,
    email_verified: true,
    name: u.name,
  });
  const r = await call<{ localId: string }>(
    'POST',
    `${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo`,
    {
      postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`,
      requestUri: 'http://localhost',
      returnSecureToken: true,
    },
  );
  return r.localId;
}

export default async function globalSetup() {
  await call(
    'DELETE',
    `${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
  );
  await call('DELETE', `${AUTH}/emulator/v1/projects/${PROJECT}/accounts`);
  const uid = await googleAccount(E2E_USER);
  await googleAccount(STRANGER);
  // The claim `npm run user:grant` gives; firestore.rules require it.
  await call(
    'POST',
    `${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`,
    {
      localId: uid,
      customAttributes: JSON.stringify({ learner: true }),
    },
  );
}
