#!/bin/bash
set -e # Exit on error
set -x # Enable command echoing for debugging

# Required environment variables
# REMOTE_USER - SSH user
# REMOTE_HOST - SSH host
# REMOTE_PASSWORD - SSH password
# REMOTE_PATH - Remote deployment path

# Function to run remote commands via SSH
run_remote_cmd() {
  sshpass -p "$REMOTE_PASSWORD" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "$1"
}

# Function to copy file content to remote server
copy_to_remote() {
  echo "$1" | run_remote_cmd "sudo tee $2"
}

echo "⚙️ Setting up Nginx configuration..."

# Setup nginx configuration
NGINX_CONFIG="server {
    listen 80;
    server_name alfabvic.com.au 103.125.218.118;
    
    location / {
        proxy_pass http://localhost:10000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }

    location /_next/static/ {
        alias $REMOTE_PATH/web-app/.next/static/;
        expires 365d;
        access_log off;
    }
}"

# Update nginx configuration
copy_to_remote "$NGINX_CONFIG" "/etc/nginx/sites-available/nextjs"

echo "🔒 Setting up SSL configuration..."

# Install and configure SSL
run_remote_cmd "
    # Install certbot if not present
    if ! command -v certbot &> /dev/null; then
        echo 'Installing certbot...'
        sudo apt-get update
        sudo apt-get install -y certbot python3-certbot-nginx
        echo 'Certbot installed successfully'
    fi

    # Enable nginx configuration first
    sudo ln -sf /etc/nginx/sites-available/nextjs /etc/nginx/sites-enabled/
    sudo nginx -t && sudo systemctl restart nginx

    # Check if certificate exists
    if sudo test -f /etc/letsencrypt/live/alfabvic.com.au/fullchain.pem; then
        echo 'Certificate exists, attempting to reinstall...'
        echo '1' | sudo certbot --nginx -d alfabvic.com.au --reinstall || echo 'Warning: Certificate reinstall failed'
    else
        echo 'No certificate found, requesting new one...'
        echo '1' | sudo certbot --nginx -d alfabvic.com.au || echo 'Warning: Initial SSL setup failed'
    fi

    # Ensure auto-renewal is enabled
    sudo systemctl enable certbot.timer
    sudo systemctl start certbot.timer

    # Final nginx restart to ensure all changes are applied
    sudo nginx -t && sudo systemctl restart nginx"

echo "✅ Nginx and SSL setup completed successfully!"
