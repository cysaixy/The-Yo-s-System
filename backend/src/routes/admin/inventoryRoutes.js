import express from "express";
import { overview, log, createAdjustment } from "../../controllers/admin/inventoryController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";
//import { requirePermission } from "../../middlewares/role.middleware.js";

const inventoryRouter = express.Router();

//inventoryRouter.use(requireStaffAuth, requirePermission("can_access_inventory"));

inventoryRouter.get("/", overview);
inventoryRouter.get("/log", log);
inventoryRouter.post("/adjustments", createAdjustment);

export default inventoryRouter;