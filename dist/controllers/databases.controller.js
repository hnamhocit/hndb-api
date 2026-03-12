"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databasesController = void 0;
class DatabasesController {
    async getDatabases(req, res) {
        try {
            const showAllDatabases = req.query.showAll === 'true';
            const databases = await req.dbClient.listDatabases(showAllDatabases);
            res.json({ ok: true, data: databases });
        }
        catch (error) {
            console.error('Error listing databases:', error);
            res.status(500).json({
                ok: false,
                error: 'Failed to list databases',
            });
        }
    }
    async getSchema(req, res) {
        const db = req.params.db;
        try {
            const schema = await req.dbClient.getSchema(db);
            res.json({ ok: true, data: schema });
        }
        catch (error) {
            console.error('Error getting schema:', error);
            res.status(500).json({ ok: false, error: 'Failed to get schema' });
        }
    }
    async getTablePreview(req, res) {
        const { db, table } = req.params;
        const { page, limit } = req.query;
        if (typeof db !== 'string' || db.trim() === '') {
            return res
                .status(400)
                .json({ ok: false, error: 'Database name is required' });
        }
        if (typeof table !== 'string' || table.trim() === '') {
            return res
                .status(400)
                .json({ ok: false, error: 'Table name is required' });
        }
        if (page && isNaN(Number(page))) {
            return res
                .status(400)
                .json({ ok: false, error: 'Page must be a number' });
        }
        if (limit && isNaN(Number(limit))) {
            return res
                .status(400)
                .json({ ok: false, error: 'Limit must be a number' });
        }
        const offset = page && limit ? (Number(page) - 1) * Number(limit) : 0;
        try {
            const result = await req.dbClient.executeRawQuery(`SELECT * FROM ${table} LIMIT ${limit} OFFSET ${offset}`);
            const jsonString = JSON.stringify(result);
            const sizeBytes = Buffer.byteLength(jsonString, 'utf8');
            res.json({
                ok: true,
                data: { ...result, sizeBytes },
            });
        }
        catch (error) {
            console.error('Error querying table:', error);
            res.status(500).json({
                ok: false,
                error: 'Failed to query table',
            });
        }
    }
    async getTableRelationships(req, res) {
        const { db, table } = req.params;
        if (typeof db !== 'string' || db.trim() === '') {
            return res
                .status(400)
                .json({ ok: false, error: 'Database name is required' });
        }
        if (typeof table !== 'string' || table.trim() === '') {
            return res
                .status(400)
                .json({ ok: false, error: 'Table name is required' });
        }
        try {
            const relationships = await req.dbClient.getTableRelationships(table, db);
            res.json({ ok: true, data: relationships });
        }
        catch (error) {
            console.error('Error getting table relationships:', error);
            res.status(500).json({
                ok: false,
                error: 'Failed to get table relationships',
            });
        }
    }
    async queryPlan(req, res) {
        const { query } = req.body;
        if (typeof query !== 'string' || query.trim() === '') {
            return res
                .status(400)
                .json({ ok: false, error: 'Query is required' });
        }
        // /i : Không phân biệt hoa thường
        const isAlreadyExplain = /^\s*(EXPLAIN|DESCRIBE|DESC)\b/i.test(query);
        // Chỉ auto-generate Plan cho câu SELECT bình thường để đảm bảo an toàn
        const isSafeToAutoPlan = /^\s*SELECT\b/i.test(query);
        if (!isSafeToAutoPlan && !isAlreadyExplain) {
            return res.json({
                ok: true,
                data: null,
                message: 'Query Plan is only supported safely for SELECT statements.',
            });
        }
        try {
            const result = await req.dbClient.queryPlan(query, isAlreadyExplain);
            res.json({ ok: true, data: result });
        }
        catch (error) {
            console.error('Error getting query plan:', error);
            res.status(500).json({
                ok: false,
                error: 'Failed to get query plan',
            });
        }
    }
}
exports.databasesController = new DatabasesController();
