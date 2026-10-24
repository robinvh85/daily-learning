// npm run user:create -- <email>
// Create a login for AUTH_MODE=password (plan 2.6 / Phase 8). The password is asked twice without
// echo, or read from the first line of stdin when stdin is not a terminal:
//   echo 'secret-password' | npm run user:create -- me@example.com
import { createInterface } from 'node:readline';
import { loadEnvFile, resolveDbPath } from '../apps/server/src/config.js';
import { openAndMigrate } from '../apps/server/src/db/client.js';
import { createUser } from '../apps/server/src/modules/auth/users.js';

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

const [email, ...rest] = process.argv.slice(2);
if (!email || rest.length > 0) {
  console.error('Usage: npm run user:create -- <email>');
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

loadEnvFile();
const dbPath = resolveDbPath();
const db = openAndMigrate(dbPath);
try {
  const user = await createUser(db, email, password);
  console.log(`Created user #${user.id} <${user.email}> in ${dbPath}`);
  if ((process.env.AUTH_MODE ?? 'none') !== 'password') {
    console.log('Note: set AUTH_MODE=password in .env to require a login.');
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  db.$client.close();
}
