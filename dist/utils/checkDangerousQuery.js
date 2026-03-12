"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkDangerousQuery = checkDangerousQuery;
const node_sql_parser_1 = require("node-sql-parser");
const parser = new node_sql_parser_1.Parser();
function checkDangerousQuery(sql, dialect = 'mysql') {
    try {
        // Tạo Cây cú pháp (AST) dựa trên đúng loại Database
        const astResult = parser.astify(sql, { database: dialect });
        const statements = Array.isArray(astResult) ? astResult : [astResult];
        for (const statement of statements) {
            if (!statement)
                continue;
            const stmtType = statement.type.toLowerCase();
            // 1. Chặn các lệnh phá hoại cấu trúc (DROP, TRUNCATE)
            if (stmtType === 'drop' || stmtType === 'truncate') {
                return 'DANGEROUS_DROP';
            }
            // 2. Chặn thao tác dữ liệu diện rộng không có điều kiện (UPDATE/DELETE quên WHERE)
            if (stmtType === 'delete' || stmtType === 'update') {
                if (!('where' in statement) || !statement.where) {
                    return 'DANGEROUS_NO_WHERE';
                }
            }
        }
        return 'SAFE';
    }
    catch (error) {
        // XỬ LÝ LỖI CRASH: Nếu user gõ sai cú pháp (vd thiếu dấu ngoặc, sai chính tả)
        // Parser sẽ văng lỗi vào đây thay vì làm sập Server.
        console.error('SQL Parsing Error:', error);
        return 'INVALID_SYNTAX';
    }
}
