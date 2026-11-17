-- طرح دیتابیس کافه‌چی (PostgreSQL 17)
-- پول‌ها «تومان صحیح» هستند (فرانت فعلی هزار تومان نشان می‌دهد؛ ضرب در ۱۰۰۰).
-- شناسه‌ها int هستند تا در Node عدد برگردند (bigint به‌صورت رشته برمی‌گردد).

create table cafes (
  id            int generated always as identity primary key,
  name          text not null unique check (char_length(name) between 2 and 80),
  area          text not null,
  price_level   smallint not null default 2 check (price_level between 1 and 3),
  lat           numeric(9,6),
  lng           numeric(9,6),
  base_rating   numeric(2,1) not null default 4.0 check (base_rating between 1 and 5),
  banner_path   text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table users (
  id          int generated always as identity primary key,
  phone       text not null unique check (phone ~ '^09[0-9]{9}$'),
  name        text check (char_length(name) <= 100),
  role        text not null default 'customer' check (role in ('customer','staff','admin','owner')),
  cafe_id     int references cafes(id) on delete set null,
  area        text,
  address     text,
  email       text,
  sms_opt_in  boolean not null default true,
  points      int not null default 0 check (points >= 0),
  blocked     boolean not null default false,
  created_at  timestamptz not null default now()
);

create table products (
  id           int generated always as identity primary key,
  cafe_id      int not null references cafes(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  price_toman  int not null check (price_toman >= 0),
  in_stock     boolean not null default true,
  active       boolean not null default true,
  image_path   text,
  unique (cafe_id, name)
);

create table orders (
  id              int generated always as identity primary key,
  cafe_id         int not null references cafes(id),
  user_id         int not null references users(id),
  mode            text not null check (mode in ('pickup','delivery')),
  status          text not null default 'received' check (status in ('received','preparing','ready','delivered','cancelled')),
  payment_status  text not null default 'unpaid' check (payment_status in ('unpaid','paid','failed')),
  subtotal_toman  int not null check (subtotal_toman >= 0),
  discount_toman  int not null default 0 check (discount_toman >= 0),
  fee_toman       int not null default 0 check (fee_toman >= 0),
  total_toman     int not null check (total_toman >= 0),
  delivery        jsonb,           -- نام، موبایل، خیابان، پلاک، واحد، طبقه، کدپستی، lat/lng ...
  eta_minutes     smallint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- جزئیات تحویل فقط و حتماً برای پیک
  check ((mode = 'delivery') = (delivery is not null))
);

create table order_items (
  order_id          int not null references orders(id) on delete cascade,
  product_id        int not null references products(id),
  name_snapshot     text not null,      -- اسم و قیمت لحظه‌ی خرید ذخیره می‌شود
  unit_price_toman  int not null check (unit_price_toman >= 0),
  qty               smallint not null check (qty between 1 and 50),
  primary key (order_id, product_id)
);

create table reviews (
  id              int generated always as identity primary key,
  cafe_id         int not null references cafes(id) on delete cascade,
  user_id         int not null references users(id),
  order_id        int not null unique references orders(id),   -- هر سفارش یک نظر
  price_rating    smallint not null check (price_rating between 1 and 5),
  quality_rating  smallint not null check (quality_rating between 1 and 5),
  body            text check (char_length(body) <= 500),
  photo_path      text,
  created_at      timestamptz not null default now()
);

-- «تیکت» تصویر: مدیر کافه می‌فرستد، مدیر سایت تأیید یا رد می‌کند
create table image_tickets (
  id            int generated always as identity primary key,
  cafe_id       int not null references cafes(id) on delete cascade,
  kind          text not null check (kind in ('banner','album','product')),
  product_id    int references products(id) on delete cascade,
  file_path     text not null,
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  note          text,
  submitted_by  int not null references users(id),
  decided_by    int references users(id),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  check ((kind = 'product') = (product_id is not null))
);

create table cafe_images (
  id          int generated always as identity primary key,
  cafe_id     int not null references cafes(id) on delete cascade,
  path        text not null,
  created_at  timestamptz not null default now()
);

-- لیست پیشنهادی پولی/دستی (کافه‌های جدید تا ۳۰ روز خودکار با کوئری وارد می‌شوند)
create table featured_listings (
  cafe_id       int primary key references cafes(id) on delete cascade,
  until         timestamptz not null,
  source        text not null check (source in ('paid','manual')),
  amount_toman  int not null default 0 check (amount_toman >= 0)
);

create table otp_codes (
  id          int generated always as identity primary key,
  phone       text not null,
  code_hash   text not null,          -- هش HMAC؛ خود کد ذخیره نمی‌شود
  expires_at  timestamptz not null,
  attempts    smallint not null default 0,
  consumed    boolean not null default false,
  created_at  timestamptz not null default now()
);

create table audit_log (
  id          int generated always as identity primary key,
  user_id     int references users(id) on delete set null,
  action      text not null,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- کارمند و کافه‌دار باید به یک کافه وصل باشند
alter table users add constraint users_staff_has_cafe check (role not in ('staff','admin') or cafe_id is not null);

create index idx_orders_cafe_queue on orders (cafe_id, status, created_at desc);
create index idx_orders_user       on orders (user_id, created_at desc);
create index idx_products_cafe     on products (cafe_id);
create index idx_reviews_cafe      on reviews (cafe_id);
create index idx_tickets_status    on image_tickets (status, created_at);
create index idx_otp_phone         on otp_codes (phone, created_at desc);
