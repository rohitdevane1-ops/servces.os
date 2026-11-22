# ==============================================================================
# ServicePro OS — Admin & Staff Web Portal Production Dockerfile
# Multi-stage minimal Nginx Alpine container
# ==============================================================================

# Stage 1: Build React 19 + Vite Application
FROM node:22-alpine AS builder

WORKDIR /app

# Build arguments for Vite client environment variables
ARG VITE_API_BASE_URL=/api/v1
ARG VITE_TURNSTILE_SITE_KEY=
ARG VITE_DEMO_MODE=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE

# Copy package manifests
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy web source files
COPY . .

# Build production bundle
RUN npm run build

# Stage 2: Minimal Nginx Web Server
FROM nginx:alpine AS runner

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy compiled SPA dist
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
