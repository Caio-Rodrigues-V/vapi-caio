"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPendingMigrations = runPendingMigrations;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = __importDefault(require("../../db"));
const MIGRATIONS_DIR = path_1.default.resolve(process.cwd(), 'database', 'migrations');
function splitStatements(sql) {
    return sql
        .split(/;\s*(?:\r?\n|$)/)
        .map((statement) => statement.trim())
        .filter(Boolean);
}
async function runPendingMigrations() {
    const connection = await db_1.default.getConnection();
    try {
        await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(64) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
        const files = fs_1.default
            .readdirSync(MIGRATIONS_DIR)
            .filter((file) => /^\d+.*\.sql$/i.test(file))
            .sort();
        const results = [];
        for (const file of files) {
            const version = path_1.default.basename(file, '.sql');
            const [existing] = await connection.query('SELECT version FROM schema_migrations WHERE version = ? LIMIT 1', [version]);
            if (existing.length > 0) {
                results.push({ version, status: 'skipped' });
                continue;
            }
            const sql = fs_1.default.readFileSync(path_1.default.join(MIGRATIONS_DIR, file), 'utf8');
            const statements = splitStatements(sql).filter((statement) => !/^INSERT\s+IGNORE\s+INTO\s+schema_migrations/i.test(statement));
            await connection.beginTransaction();
            try {
                for (const statement of statements) {
                    await connection.query(statement);
                }
                await connection.query('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
                await connection.commit();
                results.push({ version, status: 'applied' });
            }
            catch (error) {
                await connection.rollback();
                throw error;
            }
        }
        return results;
    }
    finally {
        connection.release();
    }
}
//# sourceMappingURL=runMigrations.js.map