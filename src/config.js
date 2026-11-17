// همه‌ی تنظیمات از متغیرهای محیطی (فایل .env) خوانده می‌شود؛ هیچ رمزی در کد نیست.
const need = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`متغیر محیطی ${k} تنظیم نشده است (فایل .env را ببین)`); process.exit(1); }
  return v;
};

const env = process.env.NODE_ENV || "development";

export const config = {
  env,
  port: Number(process.env.PORT || 3000),
  databaseUrl: need("DATABASE_URL"),
  jwtSecret: need("JWT_SECRET"),
  otpSecret: need("OTP_SECRET"),
  smsMode: process.env.SMS_MODE || "console",
  corsOrigins: (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === "1",
};

if (config.jwtSecret.length < 32 || config.otpSecret.length < 32) {
  console.error("JWT_SECRET و OTP_SECRET باید حداقل ۳۲ نویسه باشند (openssl rand -hex 32)");
  process.exit(1);
}
if (env === "production" && config.smsMode === "console") {
  console.error("SMS_MODE=console در production مجاز نیست؛ سرویس پیامک واقعی را وصل کن");
  process.exit(1);
}
