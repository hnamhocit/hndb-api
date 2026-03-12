"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.injectDbClient = void 0;
const database_1 = require("../database");
const utils_1 = require("../utils");
const injectDbClient = async (req, res, next) => {
    const dataSourceId = req.params.dataSourceId;
    const targetDbName = (req.body?.database || req.params?.db) || null;
    if (!dataSourceId || !(0, utils_1.isValidUUID)(dataSourceId)) {
        return res
            .status(400)
            .json({ ok: false, error: 'Invalid Data Source ID' });
    }
    try {
        req.dbClient = await database_1.connectionManager.getClient(dataSourceId, targetDbName);
        next();
    }
    catch (error) {
        if (error.message === 'DATA_SOURCE_NOT_FOUND') {
            return res
                .status(404)
                .json({ ok: false, error: 'Data Source không tồn tại' });
        }
        res.status(500).json({
            ok: false,
            error: `Lỗi kết nối DB: ${error.message}`,
        });
    }
};
exports.injectDbClient = injectDbClient;
