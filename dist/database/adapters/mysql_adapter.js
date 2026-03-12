"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MariaDBAdapter = exports.MySQLAdapter = void 0;
const constants_1 = require("../../constants");
class MySQLAdapter {
    pool;
    promisePool;
    constructor(pool) {
        this.pool = pool;
        this.promisePool = this.pool.promise();
    }
    async listDatabases(showAllDatabase) {
        // Có thể áp dụng logic filter hệ thống nếu showAllDatabase = false
        const sql = 'SHOW DATABASES;';
        const [rows] = await this.promisePool.query(sql);
        const dbs = rows.map((row) => row.Database);
        if (!showAllDatabase) {
            const systemDbs = [
                'information_schema',
                'mysql',
                'performance_schema',
                'sys',
            ];
            return dbs.filter((db) => !systemDbs.includes(db));
        }
        return dbs;
    }
    async getTableRelationships(tableName, databaseName) {
        const sql = `
            SELECT
                TABLE_NAME AS source_table,
                COLUMN_NAME AS source_column,
                REFERENCED_TABLE_NAME AS target_table,
                REFERENCED_COLUMN_NAME AS target_column
            FROM
                INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE
                REFERENCED_TABLE_NAME IS NOT NULL
                AND TABLE_SCHEMA = ?
                AND (TABLE_NAME = ? OR REFERENCED_TABLE_NAME = ?);
        `;
        const [rows] = await this.promisePool.query(sql, [
            databaseName,
            tableName,
            tableName,
        ]);
        return rows;
    }
    async getSchema(databaseName) {
        if (!databaseName)
            throw new Error('MySQL requires databaseName to get schema');
        const sql = `
            SELECT
                c.TABLE_NAME AS table_name,
                c.COLUMN_NAME AS column_name,
                c.COLUMN_TYPE AS data_type,
                IF(c.IS_NULLABLE = 'YES', 1, 0) AS is_nullable,
                c.COLUMN_DEFAULT AS column_default,
                IF(c.COLUMN_KEY = 'PRI', 1, 0) AS is_primary,
                IF(c.COLUMN_KEY = 'UNI' OR c.COLUMN_KEY = 'PRI', 1, 0) AS is_unique,
                IF(c.COLUMN_KEY != '', 1, 0) AS is_indexed,
                IF(kcu.REFERENCED_TABLE_NAME IS NOT NULL, 1, 0) AS is_foreign_key
            FROM information_schema.COLUMNS c
            LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
                ON c.TABLE_SCHEMA = kcu.TABLE_SCHEMA
                AND c.TABLE_NAME = kcu.TABLE_NAME
                AND c.COLUMN_NAME = kcu.COLUMN_NAME
                AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
            WHERE c.TABLE_SCHEMA = ?
            ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION;
        `;
        const [rows] = await this.promisePool.query(sql, [databaseName]);
        return rows.reduce((acc, row) => {
            const { table_name, ...columnInfo } = row;
            if (!acc[table_name])
                acc[table_name] = [];
            acc[table_name].push({
                column_name: columnInfo.column_name,
                data_type: columnInfo.data_type,
                is_nullable: columnInfo.is_nullable === 1,
                column_default: columnInfo.column_default,
                is_primary: columnInfo.is_primary === 1,
                is_foreign_key: columnInfo.is_foreign_key === 1,
                is_unique: columnInfo.is_unique === 1,
                is_indexed: columnInfo.is_indexed === 1,
            });
            return acc;
        }, {});
    }
    async queryPlan(sql, isAlreadyExplain) {
        const planSql = isAlreadyExplain ? sql : `EXPLAIN FORMAT=JSON ${sql}`;
        const [rows] = await this.promisePool.query(planSql);
        if (isAlreadyExplain)
            return rows;
        const explainResult = rows[0];
        if (explainResult && explainResult.EXPLAIN) {
            try {
                return JSON.parse(explainResult.EXPLAIN);
            }
            catch {
                return explainResult.EXPLAIN;
            }
        }
        return rows;
    }
    async executeRawQuery(sql, maxRows = constants_1.constants.MAX_ROWS) {
        const startTime = process.hrtime.bigint();
        const isReadQuery = /^\s*(SELECT|SHOW|EXPLAIN|DESCRIBE|DESC)/i.test(sql);
        if (isReadQuery) {
            return await new Promise((resolve, reject) => {
                this.pool.getConnection((err, conn) => {
                    if (err)
                        return reject(err);
                    const cleanup = () => conn.release();
                    conn.query(`SET SESSION MAX_EXECUTION_TIME = ${constants_1.constants.QUERY_TIMEOUT_MS}`, (setErr) => {
                        if (setErr) {
                            cleanup();
                            return reject(setErr);
                        }
                        const rows = [];
                        let isLimited = false;
                        const stream = conn.query(sql).stream();
                        stream.on('data', (row) => {
                            if (rows.length < maxRows)
                                rows.push(row);
                            else {
                                isLimited = true;
                                stream.destroy();
                            }
                        });
                        stream.on('error', (err) => {
                            cleanup();
                            reject(err);
                        });
                        stream.on('end', () => {
                            cleanup();
                            resolve({
                                rows,
                                durationMs: Number(process.hrtime.bigint() - startTime) / 1_000_000,
                                isLimited,
                                command: 'SELECT',
                                affectedRows: rows.length,
                            });
                        });
                        stream.on('close', () => {
                            if (isLimited) {
                                cleanup();
                                resolve({
                                    rows,
                                    durationMs: Number(process.hrtime.bigint() -
                                        startTime) / 1_000_000,
                                    isLimited,
                                    command: 'SELECT',
                                    affectedRows: rows.length,
                                });
                            }
                        });
                    });
                });
            });
        }
        else {
            const conn = await this.promisePool.getConnection();
            try {
                await conn.query(`SET SESSION MAX_EXECUTION_TIME = ${constants_1.constants.QUERY_TIMEOUT_MS}`);
                const [result] = await conn.query(sql);
                const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
                return {
                    rows: Array.isArray(result) ? result : [],
                    durationMs,
                    isLimited: false,
                    affectedRows: !Array.isArray(result) && 'affectedRows' in result ?
                        result.affectedRows
                        : 0,
                    command: 'MUTATION',
                };
            }
            finally {
                conn.release();
            }
        }
    }
    async close() {
        await this.pool.end();
    }
}
exports.MySQLAdapter = MySQLAdapter;
class MariaDBAdapter extends MySQLAdapter {
}
exports.MariaDBAdapter = MariaDBAdapter;
