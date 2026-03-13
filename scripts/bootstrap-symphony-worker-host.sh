#!/usr/bin/env bash
set -euo pipefail

WORKER_USER="${WORKER_USER:-symphony}"
WORKER_GROUP="${WORKER_GROUP:-$WORKER_USER}"
WORKER_HOME="${WORKER_HOME:-/home/$WORKER_USER}"

SYMPHONY_REPO_URL="${SYMPHONY_REPO_URL:-https://github.com/odysseus0/symphony.git}"
SYMPHONY_REPO_BRANCH="${SYMPHONY_REPO_BRANCH:-main}"
SYMPHONY_REPO_DIR="${SYMPHONY_REPO_DIR:-/opt/symphony}"

NODE_MAJOR="${NODE_MAJOR:-20}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-4}"
PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/playwright}"
SYMPHONY_STATE_ROOT="${SYMPHONY_STATE_ROOT:-/var/lib/symphony}"
SYMPHONY_PROJECTS_ROOT="${SYMPHONY_PROJECTS_ROOT:-/opt/symphony-projects}"

GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-Symphony Worker}"
GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-symphony@$(hostname -f 2>/dev/null || hostname)}"

OPENAI_API_KEY="${OPENAI_API_KEY:-}"
CODEX_AUTH_JSON_B64="${CODEX_AUTH_JSON_B64:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

log() {
  printf '[bootstrap-symphony-host] %s\n' "$*"
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Run this script as root (e.g. sudo ...)." >&2
    exit 1
  fi
}

require_inputs() {
  if [[ -z "${OPENAI_API_KEY}" && -z "${CODEX_AUTH_JSON_B64}" ]]; then
    echo "Either OPENAI_API_KEY or CODEX_AUTH_JSON_B64 is required." >&2
    exit 1
  fi

  if [[ -z "${GITHUB_TOKEN}" ]]; then
    echo "GITHUB_TOKEN is required." >&2
    exit 1
  fi
}

install_base_packages() {
  log "Installing base packages and build dependencies."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y \
    ca-certificates \
    curl \
    git \
    jq \
    gpg \
    sudo \
    ufw \
    unzip \
    xz-utils \
    ripgrep \
    build-essential \
    pkg-config \
    autoconf \
    automake \
    libtool \
    m4 \
    libssl-dev \
    libncurses5-dev \
    libreadline-dev \
    zlib1g-dev \
    libyaml-dev \
    libxslt1-dev \
    libffi-dev \
    unixodbc-dev \
    libxml2-utils \
    fop \
    python3
}

ensure_node() {
  local current_major

  current_major=0
  if command -v node >/dev/null 2>&1; then
    current_major="$(node -p "process.versions.node.split('.')[0]")"
  fi

  if [[ "${current_major}" -ge 20 ]]; then
    log "Node.js $(node -v) already installed."
    return
  fi

  log "Installing Node.js ${NODE_MAJOR}.x."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y nodejs
}

ensure_github_cli() {
  if command -v gh >/dev/null 2>&1; then
    log "GitHub CLI already installed."
    return
  fi

  log "Installing GitHub CLI."
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | gpg --yes --dearmor -o /etc/apt/keyrings/githubcli-archive-keyring.gpg
  chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    >/etc/apt/sources.list.d/github-cli.list
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y gh
}

ensure_worker_user() {
  if id -u "${WORKER_USER}" >/dev/null 2>&1; then
    log "User ${WORKER_USER} already exists."
  else
    log "Creating system user ${WORKER_USER}."
    useradd --create-home --home-dir "${WORKER_HOME}" --shell /bin/bash "${WORKER_USER}"
  fi

  if ! getent group "${WORKER_GROUP}" >/dev/null 2>&1; then
    groupadd "${WORKER_GROUP}"
    usermod -a -G "${WORKER_GROUP}" "${WORKER_USER}"
  fi
}

configure_firewall() {
  log "Configuring UFW."
  ufw allow OpenSSH
  ufw --force enable
}

configure_swap() {
  if swapon --show | awk '{print $1}' | grep -qx '/swapfile'; then
    log "Swap already configured at /swapfile."
    return
  fi

  log "Configuring ${SWAP_SIZE_GB}G swap file."
  if ! fallocate -l "${SWAP_SIZE_GB}G" /swapfile; then
    dd if=/dev/zero of=/swapfile bs=1M count="$((SWAP_SIZE_GB * 1024))" status=progress
  fi
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile

  if ! grep -q '^/swapfile ' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
}

install_codex_cli() {
  if command -v codex >/dev/null 2>&1; then
    log "Codex CLI already installed."
    return
  fi

  log "Installing Codex CLI."
  npm install -g @openai/codex
}

install_mise() {
  if command -v mise >/dev/null 2>&1; then
    log "mise already installed."
    return
  fi

  log "Installing mise."
  sudo -u "${WORKER_USER}" env HOME="${WORKER_HOME}" sh -lc 'cd "$HOME" && curl -fsSL https://mise.run | sh'
  ln -sf "${WORKER_HOME}/.local/bin/mise" /usr/local/bin/mise
}

ensure_paths() {
  mkdir -p \
    "${WORKER_HOME}/code/symphony-workspaces" \
    "${PLAYWRIGHT_BROWSERS_PATH}" \
    "${SYMPHONY_STATE_ROOT}/logs" \
    "${SYMPHONY_PROJECTS_ROOT}" \
    /etc/symphony-worker

  chown -R "${WORKER_USER}:${WORKER_GROUP}" \
    "${WORKER_HOME}/code/symphony-workspaces" \
    "${PLAYWRIGHT_BROWSERS_PATH}" \
    "${SYMPHONY_STATE_ROOT}" \
    "${SYMPHONY_PROJECTS_ROOT}"

  chmod 755 /etc/symphony-worker
}

clone_or_update_symphony() {
  mkdir -p "$(dirname "${SYMPHONY_REPO_DIR}")"

  if [[ -d "${SYMPHONY_REPO_DIR}/.git" ]]; then
    log "Updating Symphony repository at ${SYMPHONY_REPO_DIR}."
    git config --global --add safe.directory "${SYMPHONY_REPO_DIR}"
    git -C "${SYMPHONY_REPO_DIR}" fetch origin "${SYMPHONY_REPO_BRANCH}" --depth=1
    git -C "${SYMPHONY_REPO_DIR}" checkout "${SYMPHONY_REPO_BRANCH}"
    git -C "${SYMPHONY_REPO_DIR}" pull --ff-only origin "${SYMPHONY_REPO_BRANCH}"
  else
    log "Cloning Symphony repository to ${SYMPHONY_REPO_DIR}."
    rm -rf "${SYMPHONY_REPO_DIR}"
    git clone --depth=1 --branch "${SYMPHONY_REPO_BRANCH}" "${SYMPHONY_REPO_URL}" "${SYMPHONY_REPO_DIR}"
  fi

  chown -R "${WORKER_USER}:${WORKER_GROUP}" "${SYMPHONY_REPO_DIR}"
}

build_symphony() {
  log "Installing Erlang/Elixir toolchain and building Symphony."
  sudo -u "${WORKER_USER}" env \
    HOME="${WORKER_HOME}" \
    PATH="/usr/local/bin:/usr/bin:/bin:${WORKER_HOME}/.local/bin" \
    KERL_CONFIGURE_OPTIONS="--without-javac --without-odbc --without-wx" \
    sh -lc "cd '${SYMPHONY_REPO_DIR}/elixir' && mise trust && mise install && mise exec -- mix setup && mise exec -- mix build"
}

configure_codex_home() {
  log "Writing Codex config for ${WORKER_USER}."
  install -d -m 700 -o "${WORKER_USER}" -g "${WORKER_GROUP}" "${WORKER_HOME}/.codex"

  cat >"${WORKER_HOME}/.codex/config.toml" <<EOF
model = "gpt-5.4"
model_reasoning_effort = "xhigh"

[features]
experimental_use_rmcp_client = true

[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]
EOF

  chown "${WORKER_USER}:${WORKER_GROUP}" "${WORKER_HOME}/.codex/config.toml"
  chmod 600 "${WORKER_HOME}/.codex/config.toml"

  if [[ -n "${CODEX_AUTH_JSON_B64}" ]]; then
    log "Installing supplied Codex auth.json."
    printf '%s' "${CODEX_AUTH_JSON_B64}" | base64 -d > "${WORKER_HOME}/.codex/auth.json"
    chown "${WORKER_USER}:${WORKER_GROUP}" "${WORKER_HOME}/.codex/auth.json"
    chmod 600 "${WORKER_HOME}/.codex/auth.json"
  fi
}

install_playwright() {
  log "Installing Chromium for Playwright validation."
  npx -y playwright@latest install-deps chromium
  sudo -u "${WORKER_USER}" env \
    HOME="${WORKER_HOME}" \
    PATH="/usr/local/bin:/usr/bin:/bin:${WORKER_HOME}/.local/bin" \
    PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH}" \
    sh -lc 'cd "$HOME" && npx -y playwright@latest install chromium'
  chown -R "${WORKER_USER}:${WORKER_GROUP}" "${PLAYWRIGHT_BROWSERS_PATH}"
}

configure_git_identity() {
  log "Configuring git identity for ${WORKER_USER}."
  sudo -u "${WORKER_USER}" env HOME="${WORKER_HOME}" sh -lc "cd \"\$HOME\" && git config --global user.name \"${GIT_AUTHOR_NAME}\""
  sudo -u "${WORKER_USER}" env HOME="${WORKER_HOME}" sh -lc "cd \"\$HOME\" && git config --global user.email \"${GIT_AUTHOR_EMAIL}\""
  sudo -u "${WORKER_USER}" env HOME="${WORKER_HOME}" sh -lc 'cd "$HOME" && git config --global init.defaultBranch main'
}

login_codex() {
  if [[ -n "${CODEX_AUTH_JSON_B64}" ]]; then
    log "Skipping API-key login because auth.json was supplied."
    return
  fi

  log "Logging Codex in with API key."
  printf '%s' "${OPENAI_API_KEY}" \
    | sudo -u "${WORKER_USER}" env HOME="${WORKER_HOME}" PATH="/usr/local/bin:/usr/bin:/bin:${WORKER_HOME}/.local/bin" \
      sh -lc 'cd "$HOME" && codex login --with-api-key >/dev/null'
}

login_github() {
  log "Logging GitHub CLI in."
  printf '%s' "${GITHUB_TOKEN}" \
    | sudo -u "${WORKER_USER}" env HOME="${WORKER_HOME}" sh -lc 'cd "$HOME" && gh auth login --with-token >/dev/null'
  sudo -u "${WORKER_USER}" env HOME="${WORKER_HOME}" sh -lc 'cd "$HOME" && gh auth setup-git >/dev/null'
}

write_instance_launcher() {
  log "Writing /usr/local/bin/symphony-worker-instance-start."
  cat >/usr/local/bin/symphony-worker-instance-start <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

INSTANCE_NAME="${1:?systemd instance name required}"

: "${SYMPHONY_REPO_DIR:=/opt/symphony}"
: "${SYMPHONY_WORKFLOW_FILE:?SYMPHONY_WORKFLOW_FILE is required}"

cd "${SYMPHONY_REPO_DIR}/elixir"

args=()

if [[ -n "${SYMPHONY_LOGS_ROOT:-}" ]]; then
  args+=(--logs-root "${SYMPHONY_LOGS_ROOT}")
fi

if [[ -n "${SYMPHONY_DASHBOARD_PORT:-}" ]]; then
  args+=(--port "${SYMPHONY_DASHBOARD_PORT}")
fi

args+=("${SYMPHONY_WORKFLOW_FILE}")

exec mise exec -- ./bin/symphony "${args[@]}" --i-understand-that-this-will-be-running-without-the-usual-guardrails
EOF

  chmod 755 /usr/local/bin/symphony-worker-instance-start
}

write_systemd_template() {
  log "Writing systemd template unit."
  cat >/etc/systemd/system/symphony-worker@.service <<EOF
[Unit]
Description=Symphony worker instance %i
After=network-online.target
Wants=network-online.target
ConditionPathExists=/etc/symphony-worker/%i.env

[Service]
Type=simple
User=${WORKER_USER}
Group=${WORKER_GROUP}
WorkingDirectory=${SYMPHONY_REPO_DIR}/elixir
EnvironmentFile=/etc/symphony-worker/%i.env
ExecStart=/usr/local/bin/symphony-worker-instance-start %i
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
}

print_summary() {
  cat <<EOF

Symphony host bootstrap complete.
- Template service: symphony-worker@.service
- Register per-project envs under: /etc/symphony-worker/
- Shared Symphony repo: ${SYMPHONY_REPO_DIR}
- Project repos root: ${SYMPHONY_PROJECTS_ROOT}
- Shared workspaces root: ${WORKER_HOME}/code/symphony-workspaces

Useful commands:
- systemctl status symphony-worker@<instance> --no-pager
- journalctl -u symphony-worker@<instance> -f
- sudo -u ${WORKER_USER} codex login status
- sudo -u ${WORKER_USER} gh auth status
EOF
}

main() {
  require_root
  require_inputs
  install_base_packages
  ensure_node
  ensure_github_cli
  ensure_worker_user
  configure_firewall
  configure_swap
  install_codex_cli
  install_mise
  ensure_paths
  clone_or_update_symphony
  build_symphony
  configure_codex_home
  install_playwright
  configure_git_identity
  login_codex
  login_github
  write_instance_launcher
  write_systemd_template
  print_summary
}

main "$@"
