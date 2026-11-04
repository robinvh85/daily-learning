// npm run user:grant -- <email> (--emulator | --project <id>) [--name <display name>] [--revoke]
// npm run user:grant -- --list (--emulator | --project <id>)
//
// Give a Google account access to the app. Anyone can sign in with Google, but firestore.rules
// only open `users/{uid}` to accounts with the `learner` custom claim, which this script sets
// (and creates the profile document). The account must exist: sign in once on the site first
// (it then shows "Chưa được cấp quyền"), run this, then reload the page.
//
// `--revoke` removes the claim (the data stays in Firestore). `--list` prints the accounts that
// have access.
import { parseArgs } from 'node:util';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initAdmin } from './lib/firebase-admin.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    emulator: { type: 'boolean', default: false },
    project: { type: 'string' },
    name: { type: 'string' },
    revoke: { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
  },
});
const email = positionals[0]?.trim().toLowerCase();
const noTarget = !values.emulator && !values.project;
if (noTarget || (values.list ? positionals.length > 0 : !email || positionals.length > 1)) {
  console.error(
    'Usage: npm run user:grant -- <email> (--emulator | --project <id>) [--name <display name>] [--revoke]\n' +
      '       npm run user:grant -- --list (--emulator | --project <id>)',
  );
  process.exit(2);
}

const { app, label } = initAdmin({ emulator: values.emulator, project: values.project });
const auth = getAuth(app);

if (values.list) {
  let pageToken: string | undefined;
  let total = 0;
  const granted: string[] = [];
  do {
    const page = await auth.listUsers(1000, pageToken);
    total += page.users.length;
    for (const u of page.users) {
      if (u.customClaims?.learner === true) {
        granted.push(`${u.email ?? '(no email)'}  ${u.displayName ?? ''}  uid ${u.uid}`);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  console.log(`${granted.length} of ${total} account(s) in ${label} have access:`);
  for (const line of granted) console.log(`  ${line}`);
  process.exit(0);
}

try {
  const user = await auth.getUserByEmail(email!).catch((err: { code?: string }) => {
    if (err.code === 'auth/user-not-found') {
      throw new Error(
        `No account for ${email} in ${label}. Sign in once with Google on the site, then run this again.`,
      );
    }
    throw err;
  });
  const claims = { ...user.customClaims };
  if (values.revoke) {
    delete claims.learner;
    await auth.setCustomUserClaims(user.uid, claims);
    console.log(`Revoked access of ${email} (uid ${user.uid}) in ${label}`);
  } else {
    // firestore.rules only open users/{uid} to accounts with this claim.
    await auth.setCustomUserClaims(user.uid, { ...claims, learner: true });
    const profile = getFirestore(app).doc(`users/${user.uid}`);
    const name = values.name?.trim() || user.displayName?.trim() || 'bạn';
    if (!(await profile.get()).exists) {
      await profile.create({
        displayName: name,
        level: 'A2',
        dailyGoalMin: 15,
        createdAt: Timestamp.now(),
      });
    } else if (values.name) {
      await profile.update({ displayName: name });
    }
    console.log(`Granted access to ${email} (uid ${user.uid}) in ${label}. Reload the site.`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
}
