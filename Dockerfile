# ================================
# Stage 1: Build React/Vite app
# ================================
FROM node:22-alpine AS builder
WORKDIR /app
# Copy dependency files first for Docker layer caching
COPY package*.json ./
# Install dependencies
RUN npm ci
# Copy application source
COPY . .
# Build production frontend
RUN npm run build

# ================================
# Stage 2: Serve with Nginx
# ================================
FROM nginx:alpine
# Remove default Nginx website
RUN rm -rf /usr/share/nginx/html/*
# Copy Vite production build
COPY --from=builder /app/dist /usr/share/nginx/html
# SPA routing support for React Router
RUN printf 'server {\n\
    listen 80;\n\
    server_name _;\n\
\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
\n\
    location /assets/ {\n\
        try_files $uri =404;\n\
        expires 1y;\n\
        add_header Cache-Control "public, immutable";\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
