"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.constants = void 0;
exports.constants = {
    MAX_ROWS: Number(process.env.MAX_ROWS || '50000'),
    QUERY_TIMEOUT_MS: Number(process.env.QUERY_TIMEOUT_MS || '3000'),
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
};
