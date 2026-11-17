// منطق خالص (بدون دیتابیس و شبکه) تا ساده تست شود.
import { createHmac, timingSafeEqual } from "node:crypto";

export const STATUSES = ["received", "preparing", "ready", "delivered"];
export const MAX_DELIVERY_KM = 12;

// وضعیت بعدی سفارش؛ اگر سفارش تمام شده باشد null
export function nextStatus(cur) {
  const i = STATUSES.indexOf(cur);
  return i >= 0 && i < STATUSES.length - 1 ? STATUSES[i + 1] : null;
}

// فاصله‌ی هوایی بین دو نقطه (کیلومتر)
export function haversineKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const round500 = (n) => Math.round(n / 500) * 500;

// هزینه‌ی پیک: ۱۰٬۰۰۰ تومان + ۴٬۰۰۰ تومان برای هر کیلومتر (گرد به ۵۰۰ تومان)
export const deliveryFee = (km) => 10000 + round500(km * 4000);
// تخفیف اولین سفارش: ۱۰٪ (گرد به ۵۰۰ تومان)
export const firstOrderDiscount = (subtotal) => round500(subtotal * 0.1);
// زمان تقریبی آماده‌سازی و رساندن (دقیقه)
export const etaMinutes = (qty, km) => 8 + qty * 2 + Math.round(km * 4);

// کد پیامک را هرگز ساده ذخیره نکن؛ HMAC با کلید سرور
export const hashOtp = (code, phone, secret) =>
  createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");

export function safeEqualHex(a, b) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}
