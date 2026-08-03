import fs from 'fs';
import path from 'path';
import pool from '../../db';

export type MigrationResult = {
  version: string;
  status: 'applied' | 'skipped';
};

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'database', 'migrations');

function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function runPendingMigrations(): Promise<MigrationResult[]> {
  const connection = await pool.getConnection();

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(64) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => /^\d+.*\.sql$/i.test(file))
      .sort();

    const results: MigrationResult[] = [];

    for (const file of files) {
      const version = path.basename(file, '.sql');
      const [existing] = await connection.query<any[]>(
        'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1',
        [version],
      );

      if (existing.length > 0) {
        results.push({ version, status: 'skipped' });
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const statements = splitStatements(sql).filter(
        (statement) => !/^INSERT\s+IGNORE\s+INTO\s+schema_migrations/i.test(statement),
      );

      await connection.beginTransaction();
      try {
        for (const statement of statements) {
          await connection.query(statement);
        }
        await connection.query(
          'INSERT INTO schema_migrations (version) VALUES (?)',
          [version],
        );
        await connection.commit();
        results.push({ version, status: 'applied' });
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    return results;
  } finally {
    connection.release();
  }
}
