// src/utils/generateToken.js
import jwt from "jsonwebtoken";

function generateCustomerToken(customerId) {
  return jwt.sign({ customerId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function generateStaffToken(staffId) {
  return jwt.sign({ staffId }, process.env.JWT_SECRET, { expiresIn: "1d" });
}

export { generateCustomerToken, generateStaffToken };
