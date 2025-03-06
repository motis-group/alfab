#!/bin/bash
set -e # Exit on error
set -x # Enable command echoing for debugging

# Required environment variables
# REMOTE_USER - SSH user
# REMOTE_HOST - SSH host
# REMOTE_PASSWORD - SSH password
# REMOTE_PATH - Remote deployment path (e.g., /var/www/alfab)
# APP_PATH - Local app path (e.g., web-app)

# Function to run remote commands via SSH
run_remote_cmd() {
    sshpass -p "$REMOTE_PASSWORD" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "$1"
}

# Function to copy file content to remote server
copy_to_remote() {
    echo "$1" | run_remote_cmd "sudo tee $2"
}

echo "🚀 Starting deployment process..."

# Setup systemd service configuration
SYSTEMD_SERVICE="[Unit]
Description=Next.js application
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$REMOTE_PATH/web-app
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=10000
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target"

echo "📦 Deploying application..."

# Stop existing service and update codebase
run_remote_cmd "
    sudo systemctl stop nextjs || true
    
    # Fix git ownership and directory permissions
    sudo chown -R $REMOTE_USER:$REMOTE_USER $REMOTE_PATH
    sudo chmod -R 755 $REMOTE_PATH
    
    # Configure git safety
    git config --global --add safe.directory $REMOTE_PATH
    
    cd $REMOTE_PATH
    if [ -d .git ]; then
        sudo git reset --hard
        sudo git pull
    else
        cd ..
        sudo rm -rf $REMOTE_PATH/*
        sudo git clone https://github.com/motis-group/alfab.git .
    fi
    
    cd web-app
    
    # Ensure node_modules exists and has correct permissions
    sudo mkdir -p node_modules
    sudo chown -R $REMOTE_USER:$REMOTE_USER node_modules
    
    # Install dependencies and build
    sudo npm install --production=false --no-audit  # We need dev dependencies for building
    sudo npm run build
    
    # After build, we can remove dev dependencies
    sudo npm prune --production
    
    # Set final permissions
    sudo chown -R www-data:www-data ."

echo "⚙️ Configuring services..."

# Update service configuration
copy_to_remote "$SYSTEMD_SERVICE" "/etc/systemd/system/nextjs.service"

echo "🔄 Restarting services..."

# Final setup and service restart
run_remote_cmd "
    sudo chown -R www-data:www-data $REMOTE_PATH
    cd $REMOTE_PATH/web-app
    sudo systemctl daemon-reload
    sudo systemctl enable nextjs
    sudo systemctl restart nextjs"

echo "✅ Deployment completed successfully!"
