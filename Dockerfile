# ================================
# Stage 1: Build React/Vite app
# ================================
FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_FRONTEND_URL
ARG VITE_API_BASE_URL
ARG VITE_ADMIN_EMAILS

ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_FRONTEND_URL=$VITE_FRONTEND_URL \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_ADMIN_EMAILS=$VITE_ADMIN_EMAILS

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ================================
# Stage 2: Serve with Nginx
# ================================
FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html
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
