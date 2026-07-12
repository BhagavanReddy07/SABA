// Applies scripts/init.sql to the database. Usage:
//   node scripts/db.mjs         — create tables (idempotent)
//   node scripts/db.mjs reset   — drop everything, then recreate
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env') });
config({ path: join(root, '.env.local'), override: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

if (process.argv[2] === 'reset') {
  console.log('Dropping all tables...');
  await client.query(
    'DROP TABLE IF EXISTS tasks, memories, messages, conversations, users CASCADE'
  );
}

console.log('Applying schema from scripts/init.sql...');
await client.query(readFileSync(join(root, 'scripts', 'init.sql'), 'utf8'));
console.log('Database ready.');
await client.end();
