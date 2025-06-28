# Estágio de build
FROM node:22 as builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Estágio de produção
FROM node:22-slim
WORKDIR /app

# Apenas pacotes de produção
COPY package*.json ./
RUN npm ci --only=production

# Copia o frontend buildado e o backend
COPY --from=builder /app/dist ./dist
COPY server ./server

# Expõe somente a porta do backend
EXPOSE 5173

# Executa o backend
CMD ["node", "server/index.js"]
