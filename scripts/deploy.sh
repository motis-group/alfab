#!/bin/bash
set -e
set -x

# Required environment variables
# REMOTE_USER - SSH user
# REMOTE_HOST - SSH host
# REMOTE_PASSWORD - SSH password
# REMOTE_PATH - Remote deployment path (e.g., /var/www/alfab)

run_remote_cmd() {
    sshpass -p "$REMOTE_PASSWORD" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "$1"
}

copy_to_remote() {
    echo "$1" | run_remote_cmd "sudo tee $2"
}

echo "🚀 Starting deployment process..."

SYSTEMD_SERVICE="[Unit]
Description=Next.js application
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$REMOTE_PATH
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=10000
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

[Install]
WantedBy=multi-user.target"

echo "📦 Deploying application..."

run_remote_cmd "
    sudo systemctl stop nextjs || true

    sudo chown -R $REMOTE_USER:$REMOTE_USER $REMOTE_PATH
    sudo chmod -R 755 $REMOTE_PATH

    git config --global --add safe.directory $REMOTE_PATH

    cd $REMOTE_PATH
    if [ -d .git ]; then
        sudo git fetch origin
        sudo git checkout main
        sudo git pull --ff-only origin main
    else
        sudo rm -rf $REMOTE_PATH
        sudo git clone https://github.com/motis-group/alfab.git $REMOTE_PATH
        cd $REMOTE_PATH
    fi

    # Legacy compatibility: older nginx/systemd configs may still point at /web-app.
    if [ -d web-app ] && [ ! -L web-app ]; then
        sudo rm -rf web-app
    fi
    if [ ! -e web-app ]; then
        sudo ln -s . web-app
    fi

    sudo mkdir -p node_modules
    sudo chown -R $REMOTE_USER:$REMOTE_USER node_modules

    sudo npm install --production=false --no-audit
    sudo npm run build
    sudo npm prune --production

    sudo chown -R www-data:www-data ."

echo "⚙️ Configuring services..."
copy_to_remote "$SYSTEMD_SERVICE" "/etc/systemd/system/nextjs.service"

echo "🔄 Restarting services..."

run_remote_cmd "
    sudo chown -R www-data:www-data $REMOTE_PATH
    cd $REMOTE_PATH
    sudo systemctl daemon-reload
    sudo systemctl enable nextjs
    sudo systemctl restart nextjs"

echo "✅ Deployment completed successfully!"
