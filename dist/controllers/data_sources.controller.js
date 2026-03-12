"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataSourcesController = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const mssql_1 = __importDefault(require("mssql"));
const promise_1 = __importDefault(require("mysql2/promise"));
const pg_1 = require("pg");
const database_1 = require("../database");
const utils_1 = require("../utils");
class DataSourcesController {
    async testConnection(req, res) {
        const { type, host, port, username, password, database_name, method, url, } = req.body;
        console.log(req.body);
        try {
            // 1. POSTGRESQL
            if (type === 'postgresql') {
                const client = new pg_1.Client(method === 'url' ?
                    { connectionString: url }
                    : {
                        host,
                        port,
                        user: username,
                        password,
                        database: database_name || 'postgres',
                    });
                await client.connect();
                await client.query('SELECT 1 AS test_connection');
                await client.end();
            }
            // 2. MYSQL & MARIADB (Dùng chung driver mysql2)
            else if (type === 'mysql' || type === 'maria-db') {
                const connection = await promise_1.default.createConnection(method === 'url' ? url : ({
                    host,
                    port,
                    user: username,
                    password,
                    database: database_name || undefined,
                    connectTimeout: 10000,
                }));
                await connection.execute('SELECT 1 AS test_connection');
                await connection.end();
            }
            // 3. SQL SERVER
            else if (type === 'sql-server') {
                // SQL Server config hơi đặc thù một chút (cần encrypt: true/false tùy server)
                const config = {
                    user: username,
                    password: password,
                    server: host,
                    port: port,
                    database: database_name || 'master',
                    options: {
                        encrypt: false, // Thường để false khi test ở localhost/docker
                        trustServerCertificate: true,
                    },
                };
                const pool = await mssql_1.default.connect(config);
                await pool.request().query('SELECT 1 AS test_connection');
                await pool.close(); // Dọn dẹp!
            }
            // 4. SQLITE
            else if (type === 'sqlite') {
                if (!database_name)
                    throw new Error('File path is required for SQLite');
                // Mở kết nối file, readOnly = true cho an toàn khi test
                const db = new better_sqlite3_1.default(database_name, { readonly: true });
                db.prepare('SELECT 1 AS test_connection').get();
                db.close(); // Dọn dẹp!
            }
            else {
                throw new Error(`Unsupported database type: ${type}`);
            }
            res.json({ ok: true, message: 'Connected successfully' });
        }
        catch (error) {
            res.status(400).json({
                ok: false,
                error: 'Connect failed. Please verify your connection details.',
                details: error.message,
            });
        }
    }
    async addDataSource(req, res) {
        const { name, type, userId, ...config } = req.body;
        if (!type || !userId) {
            return res.status(400).json({
                ok: false,
                error: 'Missing required fields: type or userId',
            });
        }
        if (config.method === 'url' && !config.url) {
            return res
                .status(400)
                .json({ ok: false, error: 'Missing URL configuration' });
        }
        if (config.method === 'host' &&
            type !== 'sqlite' &&
            (!config.host || !config.port)) {
            return res.status(400).json({
                ok: false,
                error: 'Missing host or port configuration',
            });
        }
        try {
            const plainPassword = config.password;
            if (config.password) {
                if (config.savePassword) {
                    config.password = (0, utils_1.encryptPassword)(config.password);
                }
                else {
                    delete config.password;
                }
            }
            delete config.savePassword;
            const { data, error } = await database_1.supabase
                .from('data_sources')
                .insert([
                {
                    type: type,
                    user_id: userId,
                    config: config,
                    name: name,
                },
            ])
                .select()
                .single();
            if (error) {
                console.error('Error adding data source:', error.message);
                return res
                    .status(500)
                    .json({ ok: false, error: 'Failed to add data source.' });
            }
            try {
                await database_1.connectionManager.initializeTemporaryConnection(data, plainPassword);
            }
            catch (poolError) {
                console.warn('Could not initialize pool immediately:', poolError);
            }
            res.json({ ok: true, data: data });
        }
        catch (error) {
            console.error('Error adding data source:', error);
            res.status(500).json({
                ok: false,
                error: 'Failed to add data source.',
            });
        }
    }
    async runQuery(req, res) {
        const { query, dialect, forced } = req.body;
        if (typeof query !== 'string' || query.trim() === '') {
            return res
                .status(400)
                .json({ ok: false, error: 'Query is required' });
        }
        let dangerousCheckResult = (0, utils_1.checkDangerousQuery)(query, dialect);
        if (dangerousCheckResult === 'INVALID_SYNTAX') {
            return res.status(400).json({
                ok: false,
                error: 'Invalid SQL syntax detected.',
                data: null,
            });
        }
        if (dangerousCheckResult !== 'SAFE' && !forced) {
            return res.status(403).json({
                ok: false,
                error: 'Dangerous query detected: ' + dangerousCheckResult,
                data: null,
            });
        }
        try {
            const result = await req.dbClient.executeRawQuery(query);
            res.json({ ok: true, data: result });
        }
        catch (error) {
            if (!res.headersSent) {
                console.error('Error executing query:', error);
                res.status(500).json({
                    ok: false,
                    error: error.message || 'Failed to execute query',
                    data: null,
                });
            }
        }
    }
    async streamStatus(req, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform'); // no-transform rất quan trọng để tránh bị nén (gzip)
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Ngăn chặn Nginx/Proxy buffer dữ liệu SSE
        // 2. Ép Express phải gửi Header về Frontend NGAY LẬP TỨC
        res.flushHeaders();
        res.write(`data: ${JSON.stringify({ message: 'connected to status stream' })}\n\n`);
        const listener = (payload) => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
        };
        database_1.connectionManager.on('status_changed', listener);
        // 3. HEARTBEAT (PING) - GIỮ KẾT NỐI KHÔNG BỊ RỚT
        // Nhiều trình duyệt/proxy sẽ tự ngắt kết nối nếu quá 30-60s không có dữ liệu truyền qua.
        // Ta bắn một cái "comment" (bắt đầu bằng dấu hai chấm) mỗi 30s. Browser sẽ lờ nó đi nhưng mạng vẫn được giữ!
        const pingInterval = setInterval(() => {
            res.write(':\n\n');
        }, 30000);
        req.on('close', () => {
            clearInterval(pingInterval);
            database_1.connectionManager.off('status_changed', listener);
            res.end();
        });
    }
    async reconnect(req, res) {
        const dataSourceId = req.params.dataSourceId;
        try {
            await database_1.connectionManager.reconnect(dataSourceId);
            res.json({ ok: true, message: 'Reconnected successfully' });
        }
        catch (error) {
            console.error('Error reconnecting:', error);
            res.status(500).json({
                ok: false,
                error: 'Failed to reconnect: ' + error.message,
            });
        }
    }
    async disconnect(req, res) {
        const dataSourceId = req.params.dataSourceId;
        try {
            await database_1.connectionManager.disconnect(dataSourceId);
            res.json({ ok: true, message: 'Disconnected successfully' });
        }
        catch (error) {
            console.error('Error disconnecting:', error);
            res.status(500).json({
                ok: false,
                error: 'Failed to disconnect: ' + error.message,
            });
        }
    }
    async getBulkStatus(req, res) {
        try {
            const { ids } = req.body;
            if (!Array.isArray(ids) ||
                ids.some((id) => typeof id !== 'string')) {
                return res
                    .status(400)
                    .json({ ok: false, error: 'Invalid IDs format' });
            }
            const statuses = {};
            for (const id of ids) {
                const status = database_1.connectionManager.isConnected(id);
                statuses[id] = status;
            }
            res.json({ ok: true, data: statuses });
        }
        catch (error) {
            console.error('Error in getBulkStatus:', error);
            res.status(500).json({
                ok: false,
                error: 'Failed to get bulk status.',
            });
        }
    }
}
exports.dataSourcesController = new DataSourcesController();
