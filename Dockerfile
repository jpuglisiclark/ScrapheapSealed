# Scrapheap Sealed: one container serving the API and the built web app.
FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
# Pools and decks are stored here; mount a persistent volume at /data.
ENV DB_PATH=/data/sealed.db
EXPOSE 8080

CMD ["npx", "tsx", "server/index.ts"]
