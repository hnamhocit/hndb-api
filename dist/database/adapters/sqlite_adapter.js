"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteAdapter = void 0;
const constants_1 = require("../../constants");
class SqliteAdapter {
    db;
    constructor(db) {
        this.db = db;
    }
    async listDatabases(showAllDatabase) {
        // SQLite lưu dữ liệu trong 1 file, nên thường chỉ có database mặc định là 'main'
        return ['main'];
    }
    async getTableRelationships(tableName, databaseName) {
        const stmt = this.db.prepare(`PRAGMA foreign_key_list("${tableName}");`);
        const fks = stmt.all();
        return fks.map((fk) => ({
            source_table: tableName,
            source_column: fk.from,
            target_table: fk.table,
            target_column: fk.to,
        }));
    }
    async getSchema(databaseName) {
        const tablesStmt = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
        const tables = tablesStmt.all();
        const schema = {};
        for (const table of tables) {
            const colsStmt = this.db.prepare(`PRAGMA table_info("${table.name}");`);
            const fksStmt = this.db.prepare(`PRAGMA foreign_key_list("${table.name}");`);
            const columns = colsStmt.all();
            const fks = fksStmt.all();
            const fkColNames = fks.map((f) => f.from);
            schema[table.name] = columns.map((col) => ({
                column_name: col.name,
                data_type: col.type,
                is_nullable: col.notnull === 0,
                column_default: col.dflt_value,
                is_primary: col.pk > 0,
                is_foreign_key: fkColNames.includes(col.name),
                is_unique: false, // Cần query PRAGMA index_list phức tạp hơn
                is_indexed: false,
            }));
        }
        return schema;
    }
    async queryPlan(sql, isAlreadyExplain) {
        const planSql = isAlreadyExplain ? sql : `EXPLAIN QUERY PLAN ${sql}`;
        const stmt = this.db.prepare(planSql);
        return stmt.all();
    }
    async executeRawQuery(sql, maxRows = constants_1.constants.MAX_ROWS) {
        const startTime = process.hrtime.bigint();
        const isReadQuery = /^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(sql);
        try {
            if (isReadQuery) {
                const stmt = this.db.prepare(sql);
                const rows = [];
                let isLimited = false;
                // Dùng iterator để ngừng lấy dữ liệu sớm nếu vượt quá maxRows
                for (const row of stmt.iterate()) {
                    if (rows.length < maxRows) {
                        rows.push(row);
                    }
                    else {
                        isLimited = true;
                        break;
                    }
                }
                const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
                return {
                    rows,
                    durationMs,
                    isLimited,
                    command: 'SELECT',
                    affectedRows: rows.length,
                };
            }
            else {
                const stmt = this.db.prepare(sql);
                const info = stmt.run();
                const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
                return {
                    rows: [],
                    durationMs,
                    isLimited: false,
                    affectedRows: info.changes,
                    command: 'MUTATION',
                };
            }
        }
        catch (error) {
            throw error;
        }
    }
    async close() {
        this.db.close();
    }
}
exports.SqliteAdapter = SqliteAdapter;
