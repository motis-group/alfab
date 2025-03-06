#!/bin/bash
set -e

# This script is designed to be executed locally by Terraform to deploy the app to EC2
# It will be executed by the local-exec provisioner in Terraform

# Required environment variables (will be provided by Terraform)
# PUBLIC_IP - EC2 instance public IP
# SSH_KEY_PATH - Path to SSH private key
# APP_PATH - Path to the NextJS app source code (web-app)

echo "🚀 Deploying NextJS application to EC2 instance at $PUBLIC_IP"

# Ensure we can connect to the server
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY_PATH" ubuntu@"$PUBLIC_IP" "echo 'Connection established!'"

# Create a temporary deployment directory
DEPLOY_DIR=$(mktemp -d)
TIMESTAMP=$(date +%Y%m%d%H%M%S)
DEPLOY_ARCHIVE="nextjs-deploy-$TIMESTAMP.tar.gz"

echo "📦 Preparing application for deployment..."

# Copy NextJS app to temporary directory
cp -r "$APP_PATH" "$DEPLOY_DIR/web-app"

# Create .env file for production
cat >"$DEPLOY_DIR/web-app/.env.production" <<EOL
NEXT_PUBLIC_API_URL=http://$PUBLIC_IP:10000
NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-http://api.alfabvic.com.au}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY:-your_copied_anon_key}
EOL

# Navigate to temp directory
cd "$DEPLOY_DIR"

# Create deployment archive
tar -czf "$DEPLOY_ARCHIVE" web-app

# Upload to server
echo "📤 Uploading application to server..."
scp -i "$SSH_KEY_PATH" "$DEPLOY_ARCHIVE" ubuntu@"$PUBLIC_IP":~/"$DEPLOY_ARCHIVE"

# Deploy on the server
echo "🔧 Deploying on the server..."
ssh -i "$SSH_KEY_PATH" ubuntu@"$PUBLIC_IP" <<EOF
    # Extract archive
    mkdir -p ~/deploy
    tar -xzf ~/$DEPLOY_ARCHIVE -C ~/deploy
    
    # Stop any running instance
    sudo pm2 stop nextjs || true
    sudo pm2 delete nextjs || true
    
    # Deploy to target directory
    sudo rm -rf /var/www/alfab/web-app
    sudo cp -r ~/deploy/web-app /var/www/alfab/
    
    # Set permissions
    sudo chown -R ubuntu:ubuntu /var/www/alfab
    
    # Install dependencies and build
    cd /var/www/alfab/web-app
    npm install --production=false --no-audit
    npm run build
    npm prune --production
    
    # Start application with PM2
    sudo pm2 start npm --name nextjs -- start -- -p 10000
    sudo pm2 save
    sudo pm2 startup
    
    # Cleanup
    rm -rf ~/deploy
    rm ~/$DEPLOY_ARCHIVE
EOF

# Cleanup local temp directory
rm -rf "$DEPLOY_DIR"

echo "✅ NextJS application deployed successfully!"
echo "📌 You can access your application at: http://$PUBLIC_IP"
