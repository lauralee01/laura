import dotenv from 'dotenv';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function main(): Promise<void> {
  // Load `backend/.env` when running this script directly (outside NestJS).
  // This prevents "DATABASE_URL is missing" surprises.
  dotenv.config({ path: path.join(process.cwd(), '.env') });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is missing. Set it in backend/.env');
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No SQL migrations found in backend/migrations');
      return;
    }

    // Basic "run all migrations once" strategy for MVP learning.
    // Later we can implement a proper migration tracking table.
    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8');
      console.log(`Running migration: ${file}`);
      await pool.query(sql);
    }

    console.log('Migrations completed.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

