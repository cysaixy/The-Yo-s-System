// src/utils/generateToken.js
import jwt from 'jsonwebtoken';

function generateCustomerToken(customerId) {
  return jwt.sign({ customerId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function generateStaffToken(staffId) {
  const secret = process.env.JWT_SECRET || 'default-secret-must-change-in-production';
  return jwt.sign({ staffId }, secret, { expiresIn: '1d' });
}

export { generateCustomerToken, generateStaffToken };
