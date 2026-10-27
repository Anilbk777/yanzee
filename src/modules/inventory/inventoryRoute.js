import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import verifyStore from "../../middlewares/verifyStore.js";
import requireStoreRole from "../../middlewares/requireStoreRole.js";
import { validateRequest, validateQuery , validateParams } from "../../middlewares/requestValidate.js";
import { StockInSchema, ListMovementsQuerySchema, ListStockQuerySchema ,ItemParamsSchema,ItemBatchesQuerySchema} from "./inventoryValidation.js";
import { stockInController, getMovementsController, getStockController ,getItemBatchesController} from "./inventoryController.js";

const inventoryRouter = Router();

inventoryRouter.use(authenticateUser, verifyStore);

inventoryRouter.post(
    "/stock-in",
    requireStoreRole("OWNER", "MANAGER"),
    validateRequest(StockInSchema),
    stockInController
);

inventoryRouter.get(
    "/movements",
    requireStoreRole("OWNER", "MANAGER"),
    validateQuery(ListMovementsQuerySchema),
    getMovementsController
);
inventoryRouter.get(
    "/stock",
    requireStoreRole("OWNER", "MANAGER"),
    validateQuery(ListStockQuerySchema),
    getStockController
);

inventoryRouter.get(
    "/items/:productId/batches",
    requireStoreRole("OWNER", "MANAGER"),
    validateParams(ItemParamsSchema),
    validateQuery(ItemBatchesQuerySchema),
    getItemBatchesController
);


export default inventoryRouter;