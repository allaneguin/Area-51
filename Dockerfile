# Imagem de producao — Node 24 porque node:sqlite so existe a partir do 22.5
# e ainda e experimental: versao solta no host quebra o boot.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Camada de dependencias separada: so refaz npm ci quando o lock muda.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

# O banco NAO pode viver em /app: todo deploy troca o filesystem da imagem.
# /data e o ponto de montagem do disco persistente do host.
ENV DB_FILE=/data/data.db
ENV PORT=3000

# HTTPS=1 marca o cookie de sessao como Secure. Sem isto o cookie viaja
# tambem em http, e a sessao e a unica coisa entre um XSS e a conta.
ENV HTTPS=1

EXPOSE 3000
CMD ["node", "--no-warnings=ExperimentalWarning", "server/index.js"]
