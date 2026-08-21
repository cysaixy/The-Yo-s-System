import express from "express";
const reservationRouter = express.Router();
import {listAll, getById, updateStatus, listTables, confirmReservation} from "../../controllers/admin/reservationsController.js";
import { getReservationOrder, upsertReservationOrder, updateReservationStatus, adminConfirmReservation, checkOrderEditPermission } from "../../controllers/admin/reservationOrderController.js";
import { requireStaffAuth } from "../../middlewares/auth.middleware.js";

// Reservations are default Cashier access per the ERD legend — no extra
// permission check needed beyond being an active staff member.
reservationRouter.use(requireStaffAuth);

reservationRouter.get("/", listAll);
reservationRouter.get("/tables", listTables);
reservationRouter.get("/:id", getById);
reservationRouter.get("/:id/order", getReservationOrder);
reservationRouter.get("/:id/order/can-edit", checkOrderEditPermission);
reservationRouter.post("/:id/order", upsertReservationOrder);
reservationRouter.patch("/:id/order", upsertReservationOrder);
reservationRouter.patch("/:id/reservation-status", updateReservationStatus);
reservationRouter.patch("/:id/confirm", adminConfirmReservation);
reservationRouter.patch("/:id/status", updateStatus);

export default reservationRouter;
