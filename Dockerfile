FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install production deps only
RUN npm install --omit=dev

# Copy backend source
COPY backend/server.js ./

# Copy frontend (served statically by backend in production)
COPY frontend/ ./public/

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "server.js"]
