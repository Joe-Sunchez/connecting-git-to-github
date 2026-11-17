import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { config } from "./config.js";

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// اعتبارسنجی بدنه‌ی درخواست با zod؛ فقط داده‌ی تمیزشده به ادامه می‌رسد
export const validate = (schema) => (req, res, next) => {
  const p = schema.safeParse(req.body);
  if (!p.success) {
    return res.status(400).json({
      error: "validation failed",
      issues: p.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  req.body = p.data;
  next();
};

// ورود: توکن را بررسی می‌کند و کاربر را هر بار از دیتابیس می‌خواند
// (پس مسدودشدن یا تغییر نقش فوراً اعمال می‌شود)
export const auth = wrap(async (req, res, next) => {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "login required" });
  let id;
  try {
    id = Number(jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }).sub);
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
  const u = (await pool.query("SELECT id, phone, name, role, cafe_id, blocked FROM users WHERE id = $1", [id])).rows[0];
  if (!u || u.blocked) return res.status(401).json({ error: "invalid token" });
  req.user = u;
  next();
});

// کنترل دسترسی در سرور (مخفی‌کردن دکمه در فرانت کافی نیست)
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: "forbidden" });

export const requireCafe = (req, res, next) =>
  req.user.cafe_id ? next() : res.status(403).json({ error: "no cafe assigned" });

// خطای داخلی را فقط در لاگ سرور می‌نویسد، نه در پاسخ به کاربر
export function errorHandler(err, _req, res, _next) {
  console.error(err);
  res.status(500).json({ error: "internal error" });
}
