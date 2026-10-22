# Outils de la chaîne cartographique (versions figées ; à vérifier lors des mises à jour).
FROM debian:trixie-slim AS tippecanoe
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libsqlite3-dev zlib1g-dev git ca-certificates
ARG TIPPECANOE_VERSION=2.79.0
RUN git clone --depth 1 --branch "${TIPPECANOE_VERSION}" https://github.com/felt/tippecanoe.git /src \
 && make -C /src -j"$(nproc)" && make -C /src install

FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends osmium-tool python3 python3-pyproj curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=tippecanoe /usr/local/bin/tippecanoe /usr/local/bin/
ARG PMTILES_VERSION=1.28.0
RUN curl -fsSL "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" \
  | tar -xz -C /usr/local/bin pmtiles
WORKDIR /repo
ENTRYPOINT ["/repo/cartographie/build.sh"]
