import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
pool.on("error", (e) => console.error("خطای اتصال دیتابیس:", e.message));

// ثبت رویدادهای مهم (ورود، تغییر وضعیت سفارش، ...) برای پیگیری
export async function audit(userId, action, details = {}) {
  await pool.query("INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)", [
    userId,
    action,
    JSON.stringify(details),
  ]);
}
