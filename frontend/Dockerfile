# Build stage
FROM node:22-slim AS build

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
# Include patches directory for patch-package
COPY patches ./patches
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine

# Copy custom nginx config if needed, or use default
# For SPA, we often need to redirect all 404s to index.html
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
