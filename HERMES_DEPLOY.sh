#!/usr/bin/env bash
set -euo pipefail

echo "=== WhatHappen hermes-dev Deployment Script ==="

DEPLOY_DIR="/opt/services/whathappen"
BRANCH="fix/hermes-dev-deploy-and-rls"

echo "1. Ensuring deploy directory: ${DEPLOY_DIR}"
mkdir -p "${DEPLOY_DIR}"
cd "${DEPLOY_DIR}"

echo "2. Fetching latest code..."
if [ ! -d ".git" ]; then
  git clone https://github.com/RajAbey68/WhatHappen.git .
fi

git fetch origin
git checkout "${BRANCH}"
git pull origin "${BRANCH}"

echo "3. Checking .env.prod..."
if [ ! -f ".env.prod" ]; then
  if [ -f ".env.prod.example" ]; then
    cp .env.prod.example .env.prod
    echo "⚠️ Created .env.prod from template. Please verify environment variables / secrets before traffic."
  else
    echo "❌ Error: .env.prod or .env.prod.example not found!"
    exit 1
  fi
fi

# Ensure APP_SESSION_SECRET is set for project token signing if missing
if ! grep -q "APP_SESSION_SECRET" .env.prod; then
  echo "Generating APP_SESSION_SECRET..."
  RANDOM_SECRET=$(openssl rand -hex 32)
  echo "APP_SESSION_SECRET=${RANDOM_SECRET}" >> .env.prod
fi

echo "4. Ensuring Docker network 'fleet-network' exists..."
docker network create fleet-network 2>/dev/null || true

echo "5. Building and starting container..."
docker compose -f docker-compose.yml up -d --build

echo "6. Health checking container..."
sleep 5
docker compose ps

if curl -s -o /dev/null -w "%{http_code}" http://localhost:3005 | grep -q "200\|307\|308\|401\|404"; then
  echo "✅ WhatHappen is responding on http://localhost:3005"
else
  echo "⚠️ Container started, but health check returned non-standard status. Check logs with 'docker compose logs -n 50'"
fi

echo "=== Deployment script complete ==="
