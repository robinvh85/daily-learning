// npm run user:create -- <email> (--emulator | --project <id>) [--name <display name>]
//
// Create a Firebase Auth login (the app has no sign-up) with the `learner` claim that
// firestore.rules require, and its profile document. The password is asked twice without echo,
// or read from the first line of stdin when stdin is not a terminal:
//   echo 'secret-password' | npm run user:create -- me@example.com --emulator
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initAdmin } from './lib/firebase-admin.js';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    // Hide what the user types after the prompt is printed.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (!muted || s.includes('\n')) process.stdout.write(muted ? '\n' : s);
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function readFirstLine(): Promise<string> {
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    rl.close();
    return line;
  }
  return '';
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    emulator: { type: 'boolean', default: false },
    project: { type: 'string' },
    name: { type: 'string' },
  },
});
const email = positionals[0]?.trim().toLowerCase();
if (!email || positionals.length > 1 || (!values.emulator && !values.project)) {
  console.error(
    'Usage: npm run user:create -- <email> (--emulator | --project <id>) [--name <display name>]',
  );
  process.exit(2);
}

let password: string;
if (process.stdin.isTTY) {
  password = await askHidden('Password: ');
  const again = await askHidden('Repeat password: ');
  if (password !== again) {
    console.error('Passwords do not match.');
    process.exit(1);
  }
} else {
  password = await readFirstLine();
}
if (password.length < 8) {
  console.error('Password must have at least 8 characters.');
  process.exit(1);
}

const { app, label } = initAdmin({ emulator: values.emulator, project: values.project });
try {
  const auth = getAuth(app);
  const user = await auth.createUser({
    email,
    password,
    displayName: values.name,
    emailVerified: true,
  });
  // firestore.rules only open users/{uid} to accounts with this claim.
  await auth.setCustomUserClaims(user.uid, { learner: true });
  await getFirestore(app)
    .doc(`users/${user.uid}`)
    .create({
      displayName: values.name?.trim() || 'bạn',
      level: 'A2',
      dailyGoalMin: 15,
      createdAt: Timestamp.now(),
    });
  console.log(`Created ${email} (uid ${user.uid}) in ${label}`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
}
