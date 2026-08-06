import express from "express";
const reservationRouter = express.Router();
import {listAll, getById, updateStatus} from "../../controllers/admin/reservationsController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";

// Reservations are default Cashier access per the ERD legend — no extra
// permission check needed beyond being an active staff member.
reservationRouter.use(requireStaffAuth);

reservationRouter.get("/", listAll);
reservationRouter.get("/:id", getById);
reservationRouter.patch("/:id/status", updateStatus);

export default reservationRouter;
