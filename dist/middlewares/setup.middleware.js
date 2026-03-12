"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMiddlewares = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const setupMiddlewares = (app) => {
    app.use((0, helmet_1.default)({ contentSecurityPolicy: false }));
    app.use((0, cors_1.default)({
        origin: [
            'https://hndb.space',
            'https://www.hndb.space',
            'http://localhost:3000',
        ],
        credentials: true,
    }));
    app.use(express_1.default.json({ limit: '1mb' }));
};
exports.setupMiddlewares = setupMiddlewares;
