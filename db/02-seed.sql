-- داده‌ی نمونه (بدون رمز و بدون اطلاعات واقعی). مختصات تقریبی و فقط برای تست است.
insert into cafes (name, area, price_level, lat, lng, base_rating) values
  ('چای‌خانه سنتی سرای قدیم', 'وکیل‌آباد', 2, 36.3050, 59.5300, 4.6),
  ('کافه سماور',               'وکیل‌آباد', 1, 36.3100, 59.5250, 4.3),
  ('قهوه‌خانه شاه‌عباسی',      'احمدآباد',  3, 36.3200, 59.5900, 4.8)
on conflict (name) do nothing;

insert into products (cafe_id, name, price_toman)
select c.id, p.name, p.price from cafes c
join (values
  ('چای‌خانه سنتی سرای قدیم','چای ذغالی',40000),
  ('چای‌خانه سنتی سرای قدیم','قهوه ترک',60000),
  ('چای‌خانه سنتی سرای قدیم','دمنوش بهارنارنج',55000),
  ('کافه سماور','لاته',75000),
  ('کافه سماور','چای سماوری',35000),
  ('قهوه‌خانه شاه‌عباسی','دیزی',150000),
  ('قهوه‌خانه شاه‌عباسی','چای شاه‌عباسی',50000)
) as p(cafe, name, price) on p.cafe = c.name
on conflict (cafe_id, name) do nothing;

-- حساب‌های نمونه (ورود با کد پیامک؛ در حالت console کد در ترمینال سرور چاپ می‌شود)
insert into users (phone, name, role) values ('09130000000', 'مدیر سایت', 'owner')
on conflict (phone) do nothing;

insert into users (phone, name, role, cafe_id)
select '09120000000', 'مدیر کافه (نمونه)', 'admin', id from cafes where name = 'چای‌خانه سنتی سرای قدیم'
on conflict (phone) do nothing;
