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

# Instalar dependências do sistema para PostgreSQL
RUN apt-get update && apt-get install -y \
    postgresql-client \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

# Somente pacotes de produção do backend
COPY package*.json ./
RUN npm ci --only=production

# Copiar apenas o frontend e servidor
COPY --from=frontend /app/dist ./dist
COPY server ./server

COPY wait-for-postgres.sh /app/wait-for-postgres.sh
RUN chmod +x /app/wait-for-postgres.sh

RUN chmod +x /app/wait-for-postgres.sh

# Variáveis de ambiente (podem ser sobrescritas no docker-compose)
ENV NODE_ENV=production
ENV DB_HOST=localhost
ENV DB_PORT=5432
ENV DB_USER=superips_user
ENV DB_PASSWORD=359628
ENV DB_NAME=superips_db
ENV JWT_SECRET=TI
ENV JWT_REFRESH_SECRET=TI_REFRESH

EXPOSE 5173

# Aguardar PostgreSQL antes de iniciar
CMD ["/bin/bash", "-c", "/app/wait-for-postgres.sh $DB_HOST $DB_PORT node server/index.js"]
