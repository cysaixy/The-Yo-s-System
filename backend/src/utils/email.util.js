// src/utils/email.util.js
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  requireTLS: process.env.SMTP_SECURE !== "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendOtpEmail(to, code) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in backend/.env");
  }
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to,
    subject: "Your Verification Code",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333333; text-align: center;">Verify Your Account</h2>
        <p style="color: #555555; font-size: 14px;">Use the following code to complete your verification request:</p>
        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #111111;">${code}</span>
        </div>
        <p style="color: #888888; font-size: 12px; text-align: center;">If you did not request this code, please ignore this email.</p>
      </div>
    `,
  };

  return await transporter.sendMail(mailOptions);
}