import { Router } from "express";
import { z } from "zod";
import { pool, audit } from "../db.js";
import { config } from "../config.js";
import { auth, requireRole, requireCafe, validate, wrap } from "../middleware.js";
import { haversineKm, deliveryFee, firstOrderDiscount, etaMinutes, nextStatus, MAX_DELIVERY_KM } from "../logic.js";

const r = Router();
const txt = (n) => z.string().trim().max(n);

const createSchema = z.object({
  cafeId: z.number().int().positive(),
  mode: z.enum(["pickup", "delivery"]),
  items: z.array(z.object({ productId: z.number().int().positive(), qty: z.number().int().min(1).max(20) })).min(1).max(30),
  delivery: z.object({
    name: txt(80).min(1), phone: z.string().regex(/^09\d{9}$/),
    street: txt(160).min(1), plate: txt(20).min(1),
    unit: txt(20).optional(), floor: txt(20).optional(), postal: txt(10).optional(),
    landmark: txt(120).optional(), note: txt(200).optional(),
    lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
  }).optional(),
}).refine((o) => (o.mode === "delivery") === !!o.delivery, { message: "delivery details are required only for delivery" });

// ثبت سفارش. قیمت‌ها و جمع کل همیشه در سرور حساب می‌شوند؛ هیچ عددی از کلاینت پذیرفته نمی‌شود.
r.post("/orders", auth, validate(createSchema), wrap(async (req, res) => {
  const { cafeId, mode, items, delivery } = req.body;
  const ids = items.map((i) => i.productId);
  if (new Set(ids).size !== ids.length) return res.status(400).json({ error: "duplicate items" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cafe = (await client.query("SELECT id, lat, lng FROM cafes WHERE id = $1 AND active", [cafeId])).rows[0];
    if (!cafe) { await client.query("ROLLBACK"); return res.status(404).json({ error: "cafe not found" }); }

    const prods = (await client.query(
      "SELECT id, name, price_toman FROM products WHERE id = ANY($1) AND cafe_id = $2 AND active AND in_stock", [ids, cafeId])).rows;
    if (prods.length !== ids.length) { await client.query("ROLLBACK"); return res.status(409).json({ error: "some items are unavailable" }); }
    const byId = new Map(prods.map((p) => [p.id, p]));

    const subtotal = items.reduce((s, i) => s + byId.get(i.productId).price_toman * i.qty, 0);
    const hadOrder = (await client.query("SELECT 1 FROM orders WHERE user_id = $1 LIMIT 1", [req.user.id])).rowCount > 0;
    const discount = hadOrder ? 0 : firstOrderDiscount(subtotal);

    let km = 0, fee = 0;
    if (mode === "delivery") {
      if (cafe.lat == null || cafe.lng == null) { await client.query("ROLLBACK"); return res.status(422).json({ error: "cafe has no location" }); }
      km = haversineKm({ lat: Number(cafe.lat), lng: Number(cafe.lng) }, { lat: delivery.lat, lng: delivery.lng });
      if (km > MAX_DELIVERY_KM) { await client.query("ROLLBACK"); return res.status(422).json({ error: "outside delivery range" }); }
      fee = deliveryFee(km);
    }
    const total = subtotal - discount + fee;
    const qty = items.reduce((s, i) => s + i.qty, 0);

    const o = (await client.query(
      `INSERT INTO orders (cafe_id, user_id, mode, subtotal_toman, discount_toman, fee_toman, total_toman, delivery, eta_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, status, payment_status, total_toman, eta_minutes, created_at`,
      [cafeId, req.user.id, mode, subtotal, discount, fee, total, delivery ? JSON.stringify(delivery) : null, etaMinutes(qty, km)])).rows[0];

    for (const i of items) {
      const p = byId.get(i.productId);
      await client.query(
        "INSERT INTO order_items (order_id, product_id, name_snapshot, unit_price_toman, qty) VALUES ($1,$2,$3,$4,$5)",
        [o.id, p.id, p.name, p.price_toman, i.qty]);
    }
    await client.query("COMMIT");
    res.status(201).json({ ...o, subtotal_toman: subtotal, discount_toman: discount, fee_toman: fee, km: Number(km.toFixed(1)) });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}));

// فقط برای توسعه: پرداخت را «موفق» می‌کند. در production باید با درگاه واقعی (مثل زرین‌پال)
// و تأیید در سرور (verify) جایگزین شود، نه با درخواست کلاینت.
if (config.env !== "production") {
  r.post("/orders/:id/mock-pay", auth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
    const u = await pool.query(
      "UPDATE orders SET payment_status = 'paid', updated_at = now() WHERE id = $1 AND user_id = $2 AND payment_status = 'unpaid' RETURNING id",
      [id, req.user.id]);
    if (!u.rowCount) return res.status(404).json({ error: "order not found or already paid" });
    await pool.query("UPDATE users SET points = points + 1 WHERE id = $1", [req.user.id]); // ۱ امتیاز برای هر سفارش
    await audit(req.user.id, "order_paid_mock", { orderId: id });
    res.json({ ok: true });
  }));
}

const ORDER_SELECT = `
  SELECT o.id, o.cafe_id, c.name AS cafe_name, o.mode, o.status, o.payment_status, o.total_toman,
         o.eta_minutes, o.created_at, o.delivery,
         COALESCE(json_agg(json_build_object('name', i.name_snapshot, 'qty', i.qty, 'unit', i.unit_price_toman))
                  FILTER (WHERE i.order_id IS NOT NULL), '[]') AS items
    FROM orders o JOIN cafes c ON c.id = o.cafe_id LEFT JOIN order_items i ON i.order_id = o.id`;

// سفارش‌های خود مشتری
r.get("/orders/mine", auth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `${ORDER_SELECT} WHERE o.user_id = $1 GROUP BY o.id, c.name ORDER BY o.created_at DESC LIMIT 50`, [req.user.id]);
  res.json(rows.map(({ delivery, ...o }) => o)); // آدرس را دوباره به مشتری نمی‌فرستیم
}));

// صف زنده‌ی کافه (فقط سفارش‌های پرداخت‌شده‌ی همان کافه)
r.get("/cafe/orders", auth, requireRole("staff", "admin"), requireCafe, wrap(async (req, res) => {
  const { rows } = await pool.query(
    `${ORDER_SELECT} WHERE o.cafe_id = $1 AND o.payment_status = 'paid' AND o.status NOT IN ('delivered','cancelled')
     GROUP BY o.id, c.name ORDER BY o.created_at`, [req.user.cafe_id]);
  res.json(rows);
}));

// رفتن به مرحله‌ی بعد: دریافت → آماده‌سازی → آماده → تحویل
r.patch("/cafe/orders/:id/status", auth, requireRole("staff", "admin"), requireCafe, wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  const cur = (await pool.query(
    "SELECT status FROM orders WHERE id = $1 AND cafe_id = $2 AND payment_status = 'paid'", [id, req.user.cafe_id])).rows[0];
  if (!cur) return res.status(404).json({ error: "not found" });
  const next = nextStatus(cur.status);
  if (!next) return res.status(409).json({ error: "order is already finished" });
  // شرط status قدیمی جلوی دو کلیک هم‌زمان را می‌گیرد
  const u = await pool.query(
    "UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 AND cafe_id = $3 AND status = $4 RETURNING id, status",
    [next, id, req.user.cafe_id, cur.status]);
  if (!u.rowCount) return res.status(409).json({ error: "status changed, reload" });
  await audit(req.user.id, "order_status", { orderId: id, status: next });
  res.json(u.rows[0]);
}));

export default r;
