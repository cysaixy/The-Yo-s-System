import express from "express";
const reservationRouter = express.Router();
import {listAll, getById, updateStatus, listTables, confirmReservation} from "../../controllers/admin/reservationsController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";

// Reservations are default Cashier access per the ERD legend — no extra
// permission check needed beyond being an active staff member.
reservationRouter.use(requireStaffAuth);

reservationRouter.get("/", listAll);
reservationRouter.get("/tables", listTables);
reservationRouter.get("/:id", getById);
reservationRouter.patch("/:id/status", updateStatus);
reservationRouter.patch("/:id/confirm", confirmReservation);

export default reservationRouter;
