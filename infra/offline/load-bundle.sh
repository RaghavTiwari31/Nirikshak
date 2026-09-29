#!/usr/bin/env sh
# Air-gapped side: verify the bundle, load the images and start SAT-SA. No network access
# is needed at any step.
#
#   cd satsa-offline-<version> && ./load-bundle.sh
set -eu

sha256sum -c SHA256SUMS
for f in satsa-images-*.tar.gz satsa-images-*.tar; do
    if [ ! -e "$f" ]; then continue; fi
    case "$f" in
        *.gz) gunzip -c "$f" | docker load ;;
        *) docker load -i "$f" ;;
    esac
done

if [ ! -f .env.offline ]; then
    cp .env.offline.example .env.offline
    echo "Created .env.offline - set the secrets in it, then re-run this script."
    exit 1
fi
if grep -q "replace-with" .env.offline; then
    echo ".env.offline still contains placeholder values - set real secrets first." >&2
    exit 1
fi

# --pull never: fail rather than ever reach out to a registry.
docker compose -f docker-compose.offline.yml --env-file .env.offline up -d --pull never
PORT=$(sed -n 's/^WEB_PORT=//p' .env.offline)
echo "SAT-SA is starting. Open http://localhost:${PORT:-8080} once 'docker compose ps' shows healthy."
echo "Optional demo data:"
echo "  docker compose -f docker-compose.offline.yml --env-file .env.offline --profile demo run --rm seed"
