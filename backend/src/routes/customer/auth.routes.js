import express from "express";
const authRouter = express.Router();
import {register, login, sendOtp, verifyOtp} from "../../controllers/customer/auth.controller.js";

// POST /api/customer/auth/register
authRouter.post("/register", register);

// POST /api/customer/auth/login
authRouter.post("/login", login);

// POST /api/customer/auth/send-otp   { email }
authRouter.post("/send-otp", sendOtp);

// POST /api/customer/auth/verify-otp { email, code }
authRouter.post("/verify-otp", verifyOtp);

export default authRouter;
