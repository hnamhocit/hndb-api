"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const database_1 = require("./database");
const middlewares_1 = require("./middlewares");
const routes_1 = __importDefault(require("./routes"));
const app = (0, express_1.default)();
(0, middlewares_1.setupMiddlewares)(app);
app.use('/', routes_1.default);
app.get('/health', async (req, res) => {
    await (0, database_1.checkSupabaseHealth)();
    res.json({ ok: true, message: 'Server is healthy' });
});
const PORT = Number(process.env.PORT || '8080');
app.listen(PORT, async () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
