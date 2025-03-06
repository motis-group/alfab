#!/bin/bash
set -e # Exit on error
set -x # Enable command echoing for debugging

# Required environment variables
# REMOTE_USER - SSH user
# REMOTE_HOST - SSH host
# REMOTE_PASSWORD - SSH password

# Function to run remote commands via SSH
run_remote_cmd() {
  sshpass -p "$REMOTE_PASSWORD" ssh -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "$1"
}

echo "🛑 Stopping server services..."

# Stop services
run_remote_cmd "
    # Stop Next.js application
    sudo systemctl stop nextjs || true
    sudo systemctl disable nextjs || true

    # Stop Nginx
    sudo systemctl stop nginx || true"

echo "✅ Server services stopped successfully!"
