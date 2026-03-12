"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionManager = void 0;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const events_1 = require("events");
const lru_cache_1 = require("lru-cache");
const mssql_1 = __importDefault(require("mssql"));
const mysql2_1 = __importDefault(require("mysql2"));
const pg_1 = require("pg");
const utils_1 = require("../utils");
const adapters_1 = require("./adapters");
const supabase_1 = require("./supabase");
class ConnectionManager extends events_1.EventEmitter {
    cache;
    passwordCache;
    constructor() {
        super();
        this.cache = new lru_cache_1.LRUCache({
            max: 200,
            ttl: 1000 * 60 * 15, // 15 phút
            dispose: (adapter, key) => {
                console.log(`♻️ Disposing connection for Cache Key: ${key}`);
                try {
                    adapter.close().catch(console.error);
                }
                catch (error) {
                    console.error(`❌ Lỗi khi đóng connection ${key}:`, error);
                }
                const dataSourceId = key.split('_')[0];
                this.emit('status_changed', {
                    id: dataSourceId,
                    status: false,
                });
            },
        });
        this.passwordCache = new lru_cache_1.LRUCache({
            max: 200,
            ttl: 1000 * 60 * 15, // 15 phút
        });
    }
    async getClient(dataSourceId, targetDbName = null) {
        const cacheKey = `${dataSourceId}_${targetDbName || 'default'}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        console.log(`Cache Miss for: ${cacheKey}. Fetching from System DB...`);
        const { data, error } = await supabase_1.supabase
            .from('data_sources')
            .select('*')
            .eq('id', dataSourceId)
            .single();
        if (error) {
            throw new Error(`Failed to fetch data source: ${error.message}`);
        }
        if (!data)
            throw new Error('DATA_SOURCE_NOT_FOUND');
        return await this.getConnection(data, targetDbName);
    }
    async getConnection(dataSource, targetDbName = null, plainPasswordOverride) {
        const actualDbName = targetDbName || dataSource.config.database_name;
        const cacheKey = `${dataSource.id}_${targetDbName || 'default'}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        if (plainPasswordOverride) {
            this.passwordCache.set(dataSource.id, plainPasswordOverride);
        }
        // Ưu tiên 1: Lấy từ tham số truyền vào (khi user vừa nhập form xong)
        // Ưu tiên 2: Lấy từ RAM Cache (khi user nhảy sang DB khác như test-db)
        // Ưu tiên 3: Giải mã từ Database (nếu user có tick "Save Password")
        const password = plainPasswordOverride ||
            this.passwordCache.get(dataSource.id) ||
            (dataSource.config.password ?
                (0, utils_1.decryptPassword)(dataSource.config.password)
                : undefined);
        let adapter;
        const isLocal = (dataSource.config.host &&
            ['localhost', '127.0.0.1'].includes(dataSource.config.host)) ||
            (dataSource.config.url &&
                (dataSource.config.url.includes('localhost') ||
                    dataSource.config.url.includes('127.0.0.1')));
        switch (dataSource.type) {
            case 'postgresql': {
                let config = {};
                if (dataSource.config.method === 'url') {
                    const urlObj = new URL(dataSource.config.url);
                    if (actualDbName)
                        urlObj.pathname = `/${actualDbName}`;
                    config = { connectionString: urlObj.toString() };
                }
                else {
                    config = {
                        host: dataSource.config.host,
                        port: dataSource.config.port,
                        database: actualDbName || 'postgres',
                        user: dataSource.config.username,
                        password: password, // Đã lấy đúng password ở trên
                    };
                }
                const pgPool = new pg_1.Pool({
                    ...config,
                    max: 5,
                    ssl: isLocal ? false : { rejectUnauthorized: false },
                });
                adapter = new adapters_1.PostgreSQLAdapter(pgPool);
                break;
            }
            // ... (Tự động áp dụng password cho mysql, sql-server) ...
            case 'mysql':
            case 'maria-db': {
                const config = dataSource.config.method === 'url' ?
                    { uri: dataSource.config.url }
                    : {
                        host: dataSource.config.host,
                        port: dataSource.config.port,
                        database: actualDbName,
                        user: dataSource.config.username,
                        password: password,
                    };
                const mysqlPool = mysql2_1.default.createPool({
                    ...config,
                    connectionLimit: 5,
                    multipleStatements: true,
                });
                adapter =
                    dataSource.type === 'maria-db' ?
                        new adapters_1.MariaDBAdapter(mysqlPool)
                        : new adapters_1.MySQLAdapter(mysqlPool);
                break;
            }
            case 'sql-server': {
                let pool;
                if (dataSource.config.method === 'url') {
                    pool = new mssql_1.default.ConnectionPool(dataSource.config.url);
                }
                else {
                    pool = new mssql_1.default.ConnectionPool({
                        user: dataSource.config.username,
                        password: password,
                        server: dataSource.config.host,
                        port: dataSource.config.port,
                        database: actualDbName || 'master',
                        pool: { max: 5 },
                        options: {
                            encrypt: !isLocal,
                            trustServerCertificate: true,
                        },
                    });
                }
                await pool.connect();
                adapter = new adapters_1.SqlServerAdapter(pool);
                break;
            }
            case 'sqlite': {
                if (!actualDbName) {
                    throw new Error('SQLite requires a valid file path');
                }
                const db = new better_sqlite3_1.default(actualDbName);
                adapter = new adapters_1.SqliteAdapter(db);
                break;
            }
            default:
                throw new Error(`Loại database ${dataSource.type} chưa được hỗ trợ`);
        }
        this.cache.set(cacheKey, adapter);
        this.emit('status_changed', { id: dataSource.id, status: true });
        return adapter;
    }
    disconnect(dataSourceId) {
        const prefix = `${dataSourceId}_`;
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }
    isConnected(dataSourceId) {
        const prefix = `${dataSourceId}_`;
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }
    async initializeTemporaryConnection(dataSource, plainPassword) {
        await this.getConnection(dataSource, null, plainPassword);
    }
    async reconnect(dataSourceId) {
        console.log(`🔄 Reconnecting Data Source: ${dataSourceId}`);
        this.disconnect(dataSourceId);
        await this.getClient(dataSourceId);
    }
}
exports.connectionManager = new ConnectionManager();
