#!/bin/bash
# WhatHappen Deployment Script
# Standalone deployment without requiring GCP secrets

set -e

echo "🚀 WhatHappen Deployment Script"
echo "================================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="whathappen"
PORT=${PORT:-8080}
NODE_ENV="production"

echo -e "${BLUE}Step 1: Pulling latest code${NC}"
git pull origin main

echo -e "${BLUE}Step 2: Installing dependencies${NC}"
npm ci

echo -e "${BLUE}Step 3: Building application${NC}"
npm run build

echo -e "${BLUE}Step 4: Stopping previous instance (if any)${NC}"
if command -v pm2 &> /dev/null; then
  pm2 stop ${PROJECT_NAME} 2>/dev/null || true
  pm2 delete ${PROJECT_NAME} 2>/dev/null || true
fi

echo -e "${BLUE}Step 5: Starting application${NC}"

# Option A: Using PM2 (recommended for production)
if command -v pm2 &> /dev/null; then
  echo -e "${GREEN}✓ Using PM2 process manager${NC}"
  pm2 start npm --name ${PROJECT_NAME} -- start
  pm2 save
  pm2 startup
  echo -e "${GREEN}✓ Application started with PM2${NC}"
  pm2 logs ${PROJECT_NAME} --lines 10
else
  # Option B: Using npm start directly
  echo -e "${GREEN}✓ Starting with npm start${NC}"
  PORT=${PORT} NODE_ENV=${NODE_ENV} npm start &
fi

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "App is running on port: ${PORT}"
echo "Environment variables needed:"
echo "  - NEXT_PUBLIC_SUPABASE_URL"
echo "  - NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "  - NEXT_PUBLIC_APP_URL"
echo "  - SUPABASE_SERVICE_ROLE_KEY"
echo ""
echo "To check logs:"
echo "  pm2 logs ${PROJECT_NAME}  (if using PM2)"
echo ""
echo "To stop the app:"
echo "  pm2 stop ${PROJECT_NAME}  (if using PM2)"
