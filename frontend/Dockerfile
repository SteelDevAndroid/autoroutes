# syntax=docker/dockerfile:1.7
# Build : docker build --build-arg MODE=demo|production -t autoroutes-frontend .
# Compilation sur l'architecture de la machine de build (fichiers statiques indépendants de la cible) : pas d'émulation pour l'image arm64.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG MODE=production
# Production : tuiles et polices servies par la même origine (sorties de cartographie/build.sh) ; valeurs vides = sans fond.
ARG VITE_BASEMAP_URL=pmtiles:///tiles/france.pmtiles
ARG VITE_MOTORWAYS_URL=pmtiles:///tiles/motorways.pmtiles
ARG VITE_GLYPHS_URL=/basemaps-assets/fonts/{fontstack}/{range}.pbf
ARG VITE_SPRITE_URL=/basemaps-assets/sprites/v4/dark
# Les variables d'environnement priment sur les fichiers .env de Vite : elles sont retirées en mode démonstration.
RUN if [ "$MODE" = "demo" ]; then \
      env -u VITE_BASEMAP_URL -u VITE_MOTORWAYS_URL -u VITE_GLYPHS_URL -u VITE_SPRITE_URL npm run build:demo; \
    else npm run build; fi

FROM nginx:1.29-alpine AS runtime
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN mkdir -p /usr/share/nginx/html/tiles /usr/share/nginx/html/basemaps-assets
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1

# CI : contexte nommé contenant les sorties vérifiées de cartographie/build.sh.
# docker build --target with-map --build-context cartography=../cartographie/out .
FROM runtime AS with-map
COPY --from=cartography /tiles/ /usr/share/nginx/html/tiles/
COPY --from=cartography /basemaps-assets/ /usr/share/nginx/html/basemaps-assets/
COPY --from=cartography /manifest.json /usr/share/nginx/html/cartography-manifest.json

# Les constructions locales existantes conservent leurs montages de données.
FROM runtime AS default
