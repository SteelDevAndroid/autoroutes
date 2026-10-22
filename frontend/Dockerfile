# syntax=docker/dockerfile:1.7
# Build : docker build --build-arg MODE=demo|production -t autoroutes-frontend .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG MODE=production
RUN if [ "$MODE" = "demo" ]; then npm run build:demo; else npm run build; fi

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN mkdir -p /usr/share/nginx/html/tiles /usr/share/nginx/html/basemaps-assets
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
