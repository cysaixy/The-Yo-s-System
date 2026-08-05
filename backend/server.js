import express from "express";
import pool from "./config/db.js";
import dotenv from "dotenv";

const app = express();

app.use(express.json());

const startServer = async () => {
  try {
    await pool.query("SELECT NOW()");
    console.log("Connected to database");

    app.listen(process.env.PORT, () => {
      console.log(`Server port running in ${process.env.PORT}`);
    });
  } catch (error) {
    console.error("Failed TO Connect to the database", error.message);
    process.exit(-1);
  }
};

startServer();