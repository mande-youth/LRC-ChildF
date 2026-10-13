FROM node:20-alpine

WORKDIR /app

# Install backend dependencies first for better layer caching
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy app sources
COPY server ./server
COPY public ./public
COPY data ./data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "server/server.js"]
