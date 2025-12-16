#!/bin/bash

# ========================================
# Sari Deployment Script
# ========================================

set -e

echo "🚀 Starting Sari deployment..."

# Navigate to project directory
cd /home/forge/sari.yourdomain.com

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production=false

# Build the application
echo "🔨 Building application..."
npm run build

# Run database migrations
echo "🗄️ Running database migrations..."
npm run db:push

# Restart the application
echo "🔄 Restarting application..."
pm2 restart sari || pm2 start npm --name "sari" -- run start

echo "✅ Deployment completed successfully!"
