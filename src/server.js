import express from "express";
import helmet from "helmet";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import { config } from "./config.js";
import { pool } from "./db.js";
import { errorHandler } from "./middleware.js";
import authRoutes from "./auth.js";
import cafeRoutes from "./routes/cafes.js";
import orderRoutes from "./routes/orders.js";

const app = express();
app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", 1); // پشت nginx

app.use(helmet());
app.use(cors({ origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)) }));
app.use(express.json({ limit: "100kb" }));
app.use(rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

app.use(authRoutes);
app.use(cafeRoutes);
app.use(orderRoutes);

app.use((_req, res) => res.status(404).json({ error: "not found" }));
app.use(errorHandler);

const server = app.listen(config.port, () => console.log(`API روی پورت ${config.port} (${config.env})`));

const stop = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
