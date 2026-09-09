// src/routes/admin/budgetRoutes.js
import express from "express";
import { list, create, update, remove } from "../../controllers/admin/budgetController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/role.middleware.js";

const budgetRouter = express.Router();

budgetRouter.use(requireStaffAuth, requirePermission("can_access_reports"));

budgetRouter.get("/", list);
budgetRouter.post("/", create);
budgetRouter.patch("/:id", update);
budgetRouter.delete("/:id", remove);

export default budgetRouter;
