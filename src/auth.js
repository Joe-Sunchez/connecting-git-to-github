import { Router } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { randomInt } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { pool, audit } from "./db.js";
import { config } from "./config.js";
import { hashOtp, safeEqualHex } from "./logic.js";
import { validate, wrap } from "./middleware.js";

const r = Router();
const phone = z.string().regex(/^09\d{9}$/, "شماره‌ی موبایل معتبر نیست");

const otpLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

// فعلاً کد در ترمینال چاپ می‌شود. برای production اینجا سرویس پیامک (مثل کاوه‌نگار) وصل می‌شود.
async function sendSms(to, text) {
  if (config.smsMode === "console") { console.log(`[SMS → ${to}] ${text}`); return; }
  throw new Error("سرویس پیامک وصل نشده است (تابع sendSms)");
}

r.post("/auth/request-otp", otpLimiter, validate(z.object({ phone })), wrap(async (req, res) => {
  const p = req.body.phone;
  const recent = (await pool.query(
    "SELECT count(*)::int AS n FROM otp_codes WHERE phone = $1 AND created_at > now() - interval '10 minutes'", [p]
  )).rows[0].n;
  if (recent >= 3) return res.status(429).json({ error: "too many requests, try later" });

  const code = String(randomInt(100000, 1000000));
  await pool.query(
    "INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES ($1, $2, now() + interval '2 minutes')",
    [p, hashOtp(code, p, config.otpSecret)]
  );
  await sendSms(p, `کد ورود کافه‌چی: ${code}`);
  res.json({ ok: true }); // عمداً نمی‌گوییم این شماره قبلاً ثبت شده یا نه
}));

r.post("/auth/verify-otp", otpLimiter, validate(z.object({ phone, code: z.string().regex(/^\d{6}$/) })), wrap(async (req, res) => {
  const { phone: p, code } = req.body;
  const row = (await pool.query(
    "SELECT id, code_hash, attempts FROM otp_codes WHERE phone = $1 AND consumed = false AND expires_at > now() ORDER BY created_at DESC LIMIT 1", [p]
  )).rows[0];
  if (!row || row.attempts >= 5) return res.status(401).json({ error: "invalid or expired code" });

  if (!safeEqualHex(row.code_hash, hashOtp(code, p, config.otpSecret))) {
    await pool.query("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1", [row.id]);
    return res.status(401).json({ error: "invalid or expired code" });
  }
  await pool.query("UPDATE otp_codes SET consumed = true WHERE id = $1", [row.id]);

  // اولین ورود = ساخت حساب مشتری
  const u = (await pool.query(
    "INSERT INTO users (phone) VALUES ($1) ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING id, phone, name, role, cafe_id, points, blocked", [p]
  )).rows[0];
  if (u.blocked) return res.status(403).json({ error: "account blocked" });

  await audit(u.id, "login");
  const token = jwt.sign({ sub: String(u.id) }, config.jwtSecret, { algorithm: "HS256", expiresIn: "12h" });
  res.json({ token, user: { id: u.id, phone: u.phone, name: u.name, role: u.role, cafeId: u.cafe_id, points: u.points } });
}));

export default r;
