# کافه‌چی — بک‌اند (نسخه‌ی شروع)

Node.js 22 + Express + PostgreSQL 17 (داخل Docker). این پروژه «اسکلت درست» است، نه محصول تمام‌شده؛
الگوهای مهم (ورود با کد پیامک، نقش‌ها در سرور، قیمت‌گذاری در سرور، تراکنش) را نشان می‌دهد تا بقیه را روی همین بسازی.

## ۱. راه‌اندازی

```bash
cd cafechi-backend
cp .env.example .env
```
فایل `.env` را باز کن و رمزها را با `openssl rand -hex 32` بساز (سه مقدار جدا: رمز دیتابیس، JWT_SECRET، OTP_SECRET).
همان رمز دیتابیس را در `DATABASE_URL` هم بگذار.

```bash
docker compose up -d          # دیتابیس بالا می‌آید و db/*.sql خودکار اجرا می‌شود (فقط بار اول)
docker compose ps             # وضعیت باید healthy باشد
npm install express pg zod jsonwebtoken helmet cors express-rate-limit
npm run dev                   # API روی http://localhost:3000
npm test                      # تست‌های منطق
```
اگر بعداً `db/01-schema.sql` را عوض کردی، دیتابیس را از صفر بساز: `docker compose down -v && docker compose up -d`
(این دستور همه‌ی داده را پاک می‌کند).

## ۲. تست سریع با curl

```bash
curl -s localhost:3000/health
curl -s localhost:3000/cafes
curl -s localhost:3000/cafes/1/menu

# ورود مشتری: کد ۶ رقمی در ترمینالِ سرور چاپ می‌شود (SMS_MODE=console)
curl -s -X POST localhost:3000/auth/request-otp -H 'Content-Type: application/json' -d '{"phone":"09121234567"}'
curl -s -X POST localhost:3000/auth/verify-otp  -H 'Content-Type: application/json' -d '{"phone":"09121234567","code":"123456"}'
# از پاسخ، مقدار token را بردار:
export TOKEN=...

# سفارش حضوری (قیمت را سرور حساب می‌کند؛ productId از منو)
curl -s -X POST localhost:3000/orders -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"cafeId":1,"mode":"pickup","items":[{"productId":1,"qty":2}]}'

# پرداخت آزمایشی (فقط توسعه)، بعد سفارش در صف کافه می‌آید
curl -s -X POST localhost:3000/orders/1/mock-pay -H "Authorization: Bearer $TOKEN"
curl -s localhost:3000/orders/mine -H "Authorization: Bearer $TOKEN"
```
**سمت کافه:** با شماره‌ی نمونه‌ی `09120000000` (مدیر کافه‌ی اول) همین ورود را بزن و توکنش را در `ADMIN` بگذار:
```bash
curl -s localhost:3000/cafe/orders -H "Authorization: Bearer $ADMIN"
curl -s -X PATCH localhost:3000/cafe/orders/1/status -H "Authorization: Bearer $ADMIN"     # هر بار یک مرحله جلو می‌رود
curl -s -X PATCH localhost:3000/cafe/products/1/stock -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"in_stock":false}'
```
با توکن مشتری باید به `/cafe/orders` خطای ۴۰۳ بگیری؛ این همان «کنترل دسترسی در سرور» است.
`09130000000` حساب مدیر سایت (نقش owner) است؛ مسیرهایش هنوز ننوشته شده‌اند.

## ۳. ساختار

```
db/01-schema.sql   جدول‌ها، قیدها و ایندکس‌ها
db/02-seed.sql     کافه‌ها و منوی نمونه + دو حساب نمونه
src/config.js      خواندن و بررسی .env
src/logic.js       منطق خالص (هزینه‌ی پیک، تخفیف، وضعیت‌ها، هش کد) + tests/
src/auth.js        ورود با کد پیامک و JWT
src/middleware.js  auth، نقش‌ها، اعتبارسنجی، خطا
src/routes/        cafes.js و orders.js
```
پول‌ها «تومان صحیح» هستند (فرانت فعلی هزار تومان نشان می‌دهد).

## ۴. چه چیزهایی رعایت شده

- قیمت، تخفیف و هزینه‌ی پیک فقط در سرور و داخل یک تراکنش حساب می‌شوند.
- نقش‌ها در سرور بررسی می‌شوند و کاربر در هر درخواست دوباره از دیتابیس خوانده می‌شود (مسدودسازی فوری).
- کارمند فقط به کافه‌ی خودش دسترسی دارد (شرط `cafe_id` در کوئری‌ها).
- همه‌ی کوئری‌ها پارامتری هستند؛ ورودی‌ها با zod بررسی می‌شوند؛ کد پیامک به‌صورت HMAC ذخیره می‌شود و محدودیت تلاش دارد.
- helmet، CORS با فهرست مجاز، محدودیت تعداد درخواست، و رمزها فقط در `.env`.

## ۵. قبل از انتشار واقعی حتماً

1. HTTPS (nginx + Let's Encrypt) و `TRUST_PROXY=1`.
2. اتصال سرویس پیامک واقعی در `sendSms()`؛ `SMS_MODE=console` در production خودش خطا می‌دهد.
3. درگاه پرداخت واقعی با تأیید سمت سرور؛ `mock-pay` در production خاموش است.
4. ابزار migration به‌جای اجرای مستقیم SQL، و پشتیبان‌گیری منظم از دیتابیس.
5. آپلود تصویر (تیکت‌ها) با بررسی نوع و اندازه، ذخیره خارج از پوشه‌ی وب.
6. نگهداری توکن در کوکی `httpOnly` به‌جای localStorage و آزمایش امنیتی.

## ۶. قدم‌های بعدی پیشنهادی

مسیرهای مدیر سایت (کافه‌ها، کاربران، تیکت‌ها، لیست پیشنهادی، کمیسیون) ← ثبت نظر مشتری ← وصل‌کردن فرانت با `fetch` ←
سفارش زنده با WebSocket ← Dockerfile برای خود API و nginx جلوی آن روی VM ← CI با GitHub Actions.

## عیب‌یابی

- جدول‌ها ساخته نشدند: volume از قبل وجود دارد؛ `docker compose down -v` و دوباره `up -d`.
- `ECONNREFUSED` یا خطای رمز: رمز `DATABASE_URL` با `POSTGRES_PASSWORD` یکی نیست، یا دیتابیس هنوز healthy نشده.
- پورت ۵۴۳۲ اشغال است: در `docker-compose.yml` عدد چپ را به `5433` تغییر بده و در `DATABASE_URL` هم همان را بگذار.
