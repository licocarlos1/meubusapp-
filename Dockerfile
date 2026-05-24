# ── Stage 1: build do frontend (Vite) ───────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Stage 2: servidor de produção ────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Dependências do servidor
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Código do servidor + frontend buildado
COPY server ./server
COPY --from=frontend /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "server/index.js"]
