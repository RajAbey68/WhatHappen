#!/bin/bash
# WhatHappen deployment to hermes-dev
# Run this on hermes-dev (167.233.236.178) as root or with sudo

set -e

REPO_DIR="/opt/services/whathappen"
BRANCH="fix/raj749-rls-blocker"
ENV_FILE=".env.prod"

echo "======================================"
echo "WhatHappen → hermes-dev Deployment"
echo "======================================"
echo ""

# Step 1: Clone or pull repo
if [ ! -d "$REPO_DIR" ]; then
  echo "[1/5] Cloning repository..."
  mkdir -p /opt/services
  cd /opt/services
  git clone https://github.com/RajAbey68/WhatHappen.git whathappen
else
  echo "[1/5] Updating repository..."
  cd "$REPO_DIR"
  git fetch origin
fi

# Step 2: Checkout branch
echo "[2/5] Checking out $BRANCH..."
cd "$REPO_DIR"
git checkout "$BRANCH"
git pull origin "$BRANCH"

# Step 3: Check for .env.prod
echo "[3/5] Verifying production environment..."
if [ ! -f "$REPO_DIR/$ENV_FILE" ]; then
  echo "⚠️  Missing $ENV_FILE"
  echo ""
  echo "Create $REPO_DIR/$ENV_FILE with these values:"
  echo ""
  cat "$REPO_DIR/.env.prod.example"
  echo ""
  echo "Then run this script again."
  exit 1
fi

echo "✓ $ENV_FILE found"

# Step 4: Build and deploy with docker-compose
echo "[4/5] Deploying with docker-compose..."
cd "$REPO_DIR"

# Stop existing container if running
if docker-compose ps whathappen 2>/dev/null | grep -q "whathappen"; then
  echo "  Stopping existing container..."
  docker-compose down
fi

# Load environment and start
echo "  Building and starting container..."
docker-compose -f docker-compose.yml up -d --build

# Step 5: Verify deployment
echo "[5/5] Verifying deployment..."
sleep 5

# Check container is running
if docker-compose ps whathappen 2>/dev/null | grep -q "whathappen"; then
  echo "✓ Container is running"
else
  echo "✗ Container failed to start"
  docker-compose logs whathappen
  exit 1
fi

# Test health check (wait for port 8080)
for i in {1..30}; do
  if curl -s http://localhost:3000 > /dev/null; then
    echo "✓ Application responding on port 3000"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "✗ Application not responding after 30s"
    docker-compose logs whathappen
    exit 1
  fi
  echo "  Waiting for app to start... ($i/30)"
  sleep 1
done

echo ""
echo "======================================"
echo "✅ Deployment Successful!"
echo "======================================"
echo ""
echo "WhatHappen is now running at:"
echo "  • Internal: https://whathappen.internal.hermes.local"
echo "  • Local: http://localhost:3000"
echo ""
echo "View logs: docker-compose -f $REPO_DIR/docker-compose.yml logs -f whathappen"
echo "Stop service: docker-compose -f $REPO_DIR/docker-compose.yml down"
echo ""
