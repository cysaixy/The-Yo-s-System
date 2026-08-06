import express from "express";
import { getMenu } from "../../controllers/customer/menu.controller.js";

const menuRouter = express.Router();

// GET /api/customer/menu
menuRouter.get("/", getMenu);

export default menuRouter;