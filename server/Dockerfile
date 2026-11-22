# ==============================================================================
# ServicePro OS — Fastify Backend Production Dockerfile
# Multi-stage minimal Alpine Node.js 22 LTS container
# ==============================================================================

# Stage 1: Build & Compile TypeScript
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy TypeScript source and migration files
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to dist/
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JavaScript output and migration SQL scripts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/database/migrations ./dist/database/migrations

# Create writable upload directory for non-root node user
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads

# Expose API port
EXPOSE 3000

# Non-root user for security
USER node

# Start Fastify server
CMD ["node", "dist/index.js"]
