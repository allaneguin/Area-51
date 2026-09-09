# Imagem oficial do Node 24 (necessario para node:sqlite)
FROM node:24-alpine

WORKDIR /app

# Instala dependencias
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o codigo fonte
COPY . .

# Garante a existencia das pastas de dados e uploads
RUN mkdir -p /app/data /app/uploads

# Porta padrao
ENV PORT=3000
EXPOSE 3000

# Executa o servidor
CMD ["node", "--no-warnings=ExperimentalWarning", "server/index.js"]
