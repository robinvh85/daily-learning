/**
 * Empty the emulators and create the E2E learner (`E2E_USER`) with the `learner` claim, like
 * `npm run user:create` does.
 */
export const E2E_USER = { email: 'e2e@example.com', password: 'e2e-password', name: 'E2E' };

const PROJECT = 'demo-daily-learning';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8180';

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url}: HTTP ${res.status} ${await res.text()}`);
}

export default async function globalSetup() {
  await call(
    'DELETE',
    `${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
  );
  await call('DELETE', `${AUTH}/emulator/v1/projects/${PROJECT}/accounts`);
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: E2E_USER.email,
      password: E2E_USER.password,
      displayName: E2E_USER.name,
    }),
  });
  if (!res.ok) throw new Error(`signUp: HTTP ${res.status} ${await res.text()}`);
  const { localId } = (await res.json()) as { localId: string };
  // The claim `npm run user:create` gives; firestore.rules require it.
  await call(
    'POST',
    `${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`,
    {
      localId,
      customAttributes: JSON.stringify({ learner: true }),
    },
  );
}
