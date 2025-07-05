# Build do Frontend
FROM node:22 as frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Produção
FROM node:22-slim
WORKDIR /app

# Somente pacotes de produção do backend
COPY package*.json ./
RUN npm ci --only=production

# Copiar apenas o frontend e servidor
COPY --from=frontend /app/dist ./dist
COPY server ./server

EXPOSE 5173
CMD ["node", "server/index.js"]
