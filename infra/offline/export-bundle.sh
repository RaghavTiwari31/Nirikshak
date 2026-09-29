#!/usr/bin/env sh
# Build the SAT-SA images on a connected machine and pack everything needed for an
# air-gapped install into one directory: images tarball, compose file, env template,
# load script and checksums.
#
#   ./infra/offline/export-bundle.sh [version]      # run from the repository root
set -eu

VERSION="${1:-0.1.0}"
OUT="dist/satsa-offline-${VERSION}"
IMAGES="satsa/api:${VERSION} satsa/web:${VERSION} postgres:16-alpine"

rm -rf "$OUT" && mkdir -p "$OUT"
SATSA_VERSION="$VERSION" docker compose -f docker-compose.offline.yml \
    --env-file .env.offline.example build
docker pull postgres:16-alpine

# shellcheck disable=SC2086
docker save $IMAGES | gzip > "$OUT/satsa-images-${VERSION}.tar.gz"
cp docker-compose.offline.yml .env.offline.example infra/offline/load-bundle.sh "$OUT/"
sed -i.bak "s/^SATSA_VERSION=.*/SATSA_VERSION=${VERSION}/" "$OUT/.env.offline.example" \
    && rm -f "$OUT/.env.offline.example.bak"
(cd "$OUT" && sha256sum ./.env.offline.example ./docker-compose.offline.yml ./load-bundle.sh \
    ./satsa-images-*.tar.gz > SHA256SUMS)

echo "Bundle ready: $OUT"
ls -lh "$OUT"
