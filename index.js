const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id SERIAL PRIMARY KEY,
      nickname TEXT NOT NULL,
      score BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log("Database connected");
}

init().catch(console.error);

app.post("/save-score", async (req, res) => {
  try {
    const { nickname, score } = req.body;

    if (!nickname || score == null) {
      return res.status(400).json({
        error: "nickname and score required"
      });
    }

    await pool.query(
      "INSERT INTO leaderboard (nickname, score) VALUES ($1,$2)",
      [nickname, score]
    );

    res.json({
      success: true
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "server error"
    });
  }
}); app.get("/leaderboard", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT nickname, score
      FROM leaderboard
      ORDER BY score DESC
      LIMIT 100
    `);

    res.json(result.rows);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "server error"
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
