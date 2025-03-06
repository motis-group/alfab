#!/bin/bash

# Function to load environment variables
load_env() {
  # Check if .env file exists
  if [ -f .env ]; then
    echo "Loading environment variables from .env file..."
    # Read .env file and export variables
    while IFS='=' read -r key value; do
      # Skip comments and empty lines
      if [[ $key =~ ^[^#] ]] && [ ! -z "$key" ]; then
        # Remove any quotes from the value
        value=$(echo "$value" | tr -d '"' | tr -d "'")
        export "$key=$value"
      fi
    done <.env
  else
    echo "No .env file found, using existing environment variables..."
  fi

  # Validate required environment variables
  required_vars=("REMOTE_USER" "REMOTE_HOST" "REMOTE_PASSWORD" "REMOTE_PATH")
  missing_vars=()

  for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
      missing_vars+=("$var")
    fi
  done

  if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "❌ Error: Missing required environment variables: ${missing_vars[*]}"
    echo "Please set them in .env file or environment"
    exit 1
  fi
}
