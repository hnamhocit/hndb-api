"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const controllers_1 = require("../controllers");
const middlewares_1 = require("../middlewares");
const databases_routes_1 = __importDefault(require("./databases.routes"));
const router = express_1.default.Router();
router.post('/test-connection', middlewares_1.requestLimiter, controllers_1.dataSourcesController.testConnection);
router.post('/new', middlewares_1.requestLimiter, controllers_1.dataSourcesController.addDataSource);
router.get('/stream-status', controllers_1.dataSourcesController.streamStatus);
router.post('/bulk-status', controllers_1.dataSourcesController.getBulkStatus);
router.get('/:dataSourceId/disconnect', controllers_1.dataSourcesController.disconnect);
router.get('/:dataSourceId/reconnect', middlewares_1.injectDbClient, controllers_1.dataSourcesController.reconnect);
router.post('/:dataSourceId/query', middlewares_1.injectDbClient, controllers_1.dataSourcesController.runQuery);
// databases
router.use('/:dataSourceId/databases', databases_routes_1.default);
exports.default = router;
