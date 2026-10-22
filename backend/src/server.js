
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./db/pool");

const app = express();

const PORT = process.env.PORT || 5000;

// Allow the React frontend to connect
app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

// Parse JSON request bodies
app.use(express.json({ limit: "5mb" }));

// Root route
app.get("/", (req, res) => {
  res.json({
    application: "Ultimate Frisbee Strategy Platform",
    message: "Backend API is running",
  });
});


// PostgreSQL health-check route
app.get("/api/db-health", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS server_time"
    );

    res.status(200).json({
      success: true,
      message: "PostgreSQL connected successfully",
      databaseTime: result.rows[0].server_time,
    });
  } catch (error) {
    console.error(
      "Database connection failed:",
      error.message
    );

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

// Health-check route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Backend server is healthy",
    timestamp: new Date().toISOString(),
  });
});


// Start server
app.listen(PORT, () => {
  console.log(
    `Backend running at http://localhost:${PORT}`
  );
});
