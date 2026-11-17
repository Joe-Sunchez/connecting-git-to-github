import test from "node:test";
import assert from "node:assert/strict";
import { nextStatus, haversineKm, deliveryFee, firstOrderDiscount, etaMinutes, hashOtp, safeEqualHex, MAX_DELIVERY_KM } from "../src/logic.js";

test("وضعیت سفارش مرحله‌به‌مرحله جلو می‌رود و در پایان null می‌شود", () => {
  assert.equal(nextStatus("received"), "preparing");
  assert.equal(nextStatus("preparing"), "ready");
  assert.equal(nextStatus("ready"), "delivered");
  assert.equal(nextStatus("delivered"), null);
  assert.equal(nextStatus("bogus"), null);
});

test("فاصله‌ی هوایی: یک درجه‌ی عرض جغرافیایی ≈ ۱۱۱ کیلومتر، و نقطه تا خودش صفر", () => {
  const km = haversineKm({ lat: 36, lng: 59 }, { lat: 37, lng: 59 });
  assert.ok(Math.abs(km - 111.19) < 0.5);
  assert.equal(haversineKm({ lat: 36.3, lng: 59.5 }, { lat: 36.3, lng: 59.5 }), 0);
});

test("هزینه‌ی پیک و تخفیف اولین سفارش", () => {
  assert.equal(deliveryFee(0), 10000);
  assert.equal(deliveryFee(3), 22000);
  assert.equal(firstOrderDiscount(100000), 10000);
  assert.equal(firstOrderDiscount(72000), 7000); // ۷۲۰۰ به ۵۰۰ نزدیک می‌شود
  assert.equal(MAX_DELIVERY_KM, 12);
});

test("زمان تقریبی", () => {
  assert.equal(etaMinutes(2, 0), 12);
  assert.equal(etaMinutes(1, 3), 22);
});

test("هش کد پیامک: ثابت، وابسته به شماره و کلید، و مقایسه‌ی امن", () => {
  const a = hashOtp("123456", "09120000000", "k".repeat(32));
  assert.equal(a, hashOtp("123456", "09120000000", "k".repeat(32)));
  assert.notEqual(a, hashOtp("123456", "09121111111", "k".repeat(32)));
  assert.notEqual(a, hashOtp("123456", "09120000000", "z".repeat(32)));
  assert.ok(safeEqualHex(a, a));
  assert.ok(!safeEqualHex(a, hashOtp("654321", "09120000000", "k".repeat(32))));
});
