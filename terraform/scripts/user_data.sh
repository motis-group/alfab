#!/bin/bash
set -e

# Update package index
apt-get update
apt-get upgrade -y

# Install required packages
apt-get install -y \
  git \
  nginx \
  curl \
  unzip \
  sshpass \
  software-properties-common \
  apt-transport-https \
  ca-certificates \
  gnupg \
  lsb-release

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs
npm install -g pm2

# Set up Nginx
cat >/etc/nginx/sites-available/nextjs <<'EOL'
server {
    listen 80;
    listen [::]:80;
    server_name _;

    location / {
        proxy_pass http://localhost:10000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOL

# Enable the site and remove default
ln -sf /etc/nginx/sites-available/nextjs /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Create application directory
mkdir -p /var/www/alfab
chown -R ubuntu:ubuntu /var/www/alfab

# Restart Nginx
systemctl restart nginx
systemctl enable nginx

# Install Certbot for SSL (optional, can be set up later)
snap install core
snap refresh core
snap install --classic certbot
ln -sf /snap/bin/certbot /usr/bin/certbot

echo "Instance setup completed!"
