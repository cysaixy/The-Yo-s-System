import express from "express";
const orderRouter = express.Router();
import {createOrder, getOrder, createPayment, getPayment} from "../../controllers/customer/order.controller.js";

// POST /api/customer/orders   { customer_id, reservation_id, order_type, cart: [{menu_id, quantity}] }
orderRouter.post("/", createOrder);

// GET /api/customer/orders/:id
orderRouter.get("/:id", getOrder);

// POST /api/customer/orders/:id/payment
orderRouter.post("/:id/payment", createPayment);

// GET /api/customer/orders/:id/payment
orderRouter.get("/:id/payment", getPayment);

export default orderRouter;
