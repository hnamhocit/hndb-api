"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgreSQLAdapter = void 0;
const pg_query_stream_1 = __importDefault(require("pg-query-stream"));
const constants_1 = require("../../constants");
class PostgreSQLAdapter {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async listDatabases(showAllDatabase) {
        const sql = 'SELECT datname FROM pg_database WHERE datistemplate = false;';
        const r = await this.pool.query(sql);
        const dbs = r.rows.map((row) => row.datname);
        if (!showAllDatabase) {
            return dbs.filter((db) => db !== 'postgres');
        }
        return dbs;
    }
    async getSchema(databaseName) {
        const sql = `
            SELECT
                c.relname AS table_name,
                a.attname AS column_name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                NOT a.attnotnull AS is_nullable,
                pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
                COALESCE((SELECT indisprimary FROM pg_index i WHERE i.indrelid = c.oid AND a.attnum = ANY(i.indkey) LIMIT 1), false) AS is_primary,
                COALESCE((SELECT indisunique FROM pg_index i WHERE i.indrelid = c.oid AND a.attnum = ANY(i.indkey) LIMIT 1), false) AS is_unique,
                EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND a.attnum = ANY(i.indkey)) AS is_indexed,
                EXISTS(SELECT 1 FROM pg_constraint con WHERE con.conrelid = c.oid AND con.contype = 'f' AND a.attnum = ANY(con.conkey)) AS is_foreign_key
            FROM pg_catalog.pg_attribute a
            JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
            ORDER BY c.relname, a.attnum;
        `;
        const result = await this.pool.query(sql);
        return result.rows.reduce((acc, row) => {
            const { table_name, ...columnInfo } = row;
            if (!acc[table_name])
                acc[table_name] = [];
            acc[table_name].push({
                column_name: columnInfo.column_name,
                data_type: columnInfo.data_type,
                is_nullable: columnInfo.is_nullable,
                column_default: columnInfo.column_default,
                is_primary: columnInfo.is_primary,
                is_foreign_key: columnInfo.is_foreign_key,
                is_unique: columnInfo.is_unique,
                is_indexed: columnInfo.is_indexed,
            });
            return acc;
        }, {});
    }
    async getTableRelationships(tableName, databaseName) {
        const sql = `
            SELECT
                tc.table_name AS source_table,
                kcu.column_name AS source_column,
                ccu.table_name AS target_table,
                ccu.column_name AS target_column
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
            AND (tc.table_name = $1 OR ccu.table_name = $1);
        `;
        const result = await this.pool.query(sql, [tableName]);
        return result.rows;
    }
    async queryPlan(sql, isAlreadyExplain) {
        const planSql = isAlreadyExplain ? sql : `EXPLAIN (FORMAT JSON) ${sql}`;
        const result = await this.pool.query(planSql);
        if (isAlreadyExplain)
            return result.rows;
        const explainResult = result.rows[0];
        if (explainResult && explainResult['QUERY PLAN'])
            return explainResult['QUERY PLAN'];
        return result.rows;
    }
    async executeRawQuery(sql, maxRows = constants_1.constants.MAX_ROWS) {
        const startTime = process.hrtime.bigint();
        const client = await this.pool.connect();
        try {
            await client.query(`SET statement_timeout = ${constants_1.constants.QUERY_TIMEOUT_MS}`);
            const isReadQuery = /^\s*(SELECT|SHOW|EXPLAIN|DESCRIBE)/i.test(sql);
            if (isReadQuery) {
                return await new Promise((resolve, reject) => {
                    const rows = [];
                    let isLimited = false;
                    const stream = client.query(new pg_query_stream_1.default(sql));
                    stream.on('data', (row) => {
                        if (rows.length < maxRows)
                            rows.push(row);
                        else {
                            isLimited = true;
                            stream.destroy();
                        }
                    });
                    stream.on('error', (err) => reject(err));
                    const handleResolve = () => resolve({
                        rows,
                        durationMs: Number(process.hrtime.bigint() - startTime) /
                            1_000_000,
                        isLimited,
                        command: 'SELECT',
                        affectedRows: rows.length,
                    });
                    stream.on('end', handleResolve);
                    stream.on('close', () => {
                        if (isLimited)
                            handleResolve();
                    });
                });
            }
            else {
                const result = await client.query(sql);
                return {
                    rows: result.rows || [],
                    durationMs: Number(process.hrtime.bigint() - startTime) / 1_000_000,
                    isLimited: false,
                    affectedRows: result.rowCount || 0,
                    command: result.command,
                };
            }
        }
        finally {
            client.release();
        }
    }
    async close() {
        await this.pool.end();
    }
}
exports.PostgreSQLAdapter = PostgreSQLAdapter;
