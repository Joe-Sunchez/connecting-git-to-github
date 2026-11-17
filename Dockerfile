FROM node:22-slim

WORKDIR /app

# اول فقط package.json و lock تا لایه‌ی نصب وابستگی‌ها کش شود
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# اجرا با کاربر غیر root
USER node
EXPOSE 3000

# در کانتینر فایل .env نداریم؛ متغیرها از fly.toml و fly secrets می‌آیند
CMD ["node", "src/server.js"]
