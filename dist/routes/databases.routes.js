"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const controllers_1 = require("../controllers");
const middlewares_1 = require("../middlewares");
const router = express_1.default.Router({ mergeParams: true });
router.get('/', middlewares_1.injectDbClient, controllers_1.databasesController.getDatabases);
router.get('/:db/schema', middlewares_1.injectDbClient, controllers_1.databasesController.getSchema);
router.get('/:db/tables/:table/preview', middlewares_1.injectDbClient, controllers_1.databasesController.getTablePreview);
router.post('/:db/query/plan', middlewares_1.injectDbClient, controllers_1.databasesController.queryPlan);
router.get('/:db/tables/:table/relationships', middlewares_1.injectDbClient, controllers_1.databasesController.getTableRelationships);
exports.default = router;
