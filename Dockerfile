# ==========================================
# STAGE 1: BUILDER (Dùng để build code)
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Cài tool build ở Stage 1 để cài các thư viện lõi cứng (như better-sqlite3)
RUN apk add --no-cache python3 make g++

RUN npm install

COPY . .

RUN npm run build


# ==========================================
# STAGE 2: DEPS (Lọc lấy node_modules siêu nhẹ)
# ==========================================
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./

# Vẫn cần tool build ở Stage 2 đề phòng lúc npm lọc thư viện production
RUN apk add --no-cache python3 make g++

RUN npm install --omit=dev


# ==========================================
# STAGE 3: PRODUCTION (Container cuối cùng mang đi chạy)
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

EXPOSE 8080

CMD ["node", "dist/main.js"]