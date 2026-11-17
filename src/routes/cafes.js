import { Router } from "express";
import { z } from "zod";
import { pool, audit } from "../db.js";
import { auth, requireRole, requireCafe, validate, wrap } from "../middleware.js";

const r = Router();

// لیست کافه‌ها (عمومی). ?area=وکیل‌آباد
r.get("/cafes", wrap(async (req, res) => {
  const area = typeof req.query.area === "string" ? req.query.area : null;
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.area, c.price_level, c.lat, c.lng, c.banner_path,
            COALESCE(ROUND(AVG((rv.price_rating + rv.quality_rating) / 2.0), 1), c.base_rating) AS rating,
            COUNT(rv.id)::int AS reviews
       FROM cafes c LEFT JOIN reviews rv ON rv.cafe_id = c.id
      WHERE c.active AND ($1::text IS NULL OR c.area = $1)
      GROUP BY c.id ORDER BY rating DESC, c.id`, [area]);
  res.json(rows);
}));

// کافه‌های پیشنهادی: پولی/دستی + کافه‌های جدید (۳۰ روز اول)
r.get("/cafes/featured", wrap(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.area, c.banner_path,
            CASE WHEN fl.until > now() THEN fl.source ELSE 'new' END AS kind
       FROM cafes c LEFT JOIN featured_listings fl ON fl.cafe_id = c.id
      WHERE c.active AND (fl.until > now() OR c.created_at > now() - interval '30 days')
      ORDER BY (fl.until > now()) DESC NULLS LAST, c.created_at DESC LIMIT 12`);
  res.json(rows);
}));

// منوی یک کافه
r.get("/cafes/:id/menu", wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
  const { rows } = await pool.query(
    "SELECT id, name, price_toman, in_stock, image_path FROM products WHERE cafe_id = $1 AND active ORDER BY id", [id]);
  res.json(rows);
}));

// «موجودی نداریم» توسط کارمند یا مدیر همان کافه
// شرط cafe_id در کوئری یعنی کسی به محصول کافه‌ی دیگر دست نمی‌زند
r.patch("/cafe/products/:id/stock", auth, requireRole("staff", "admin"), requireCafe,
  validate(z.object({ in_stock: z.boolean() })), wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "bad id" });
    const { rows } = await pool.query(
      "UPDATE products SET in_stock = $1 WHERE id = $2 AND cafe_id = $3 RETURNING id, name, in_stock",
      [req.body.in_stock, id, req.user.cafe_id]);
    if (!rows[0]) return res.status(404).json({ error: "not found" });
    await audit(req.user.id, "product_stock", { productId: id, in_stock: req.body.in_stock });
    res.json(rows[0]);
  }));

export default r;
