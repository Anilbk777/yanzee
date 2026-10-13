import { Router } from "express";
import authenticateUser from "../../middlewares/authenticate.js";
import verifyStore from "../../middlewares/verifyStore.js";
import requireStoreRole from "../../middlewares/requireStoreRole.js";
import { validateRequest, validateQuery } from "../../middlewares/requestValidate.js";
import { StockInSchema, ListMovementsQuerySchema, ListStockQuerySchema } from "./inventoryValidation.js";
import { stockInController, getMovementsController, getStockController } from "./inventoryController.js";

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
    requireStoreRole("OWNER", "MANAGER"), // values and costs are sensitive; add more roles if needed
    validateQuery(ListMovementsQuerySchema),
    getMovementsController
);
inventoryRouter.get("/stock", requireStoreRole("OWNER", "MANAGER"), validateQuery(ListStockQuerySchema), getStockController);

export default inventoryRouter;