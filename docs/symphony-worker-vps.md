# Symphony Worker VPS

This runbook provisions a dedicated DigitalOcean Droplet for Symphony. Keep it separate from the ALFAB production app VPS.

## Recommended baseline

- Provider: DigitalOcean Basic Droplet
- Region: `syd1`
- OS: Ubuntu 24.04 LTS
- Size: `s-2vcpu-4gb`
- Public IP: 1 static IPv4

Why separate:

- Symphony runs long-lived orchestration and can keep multiple Codex sessions active.
- Worker tickets may run builds, tests, and Playwright checks that should not contend with production.
- A worker host can be restarted, rebuilt, or rotated without touching the app serving traffic.

## What the bootstrap installs

- Node.js 20
- `@openai/codex`
- `gh`
- `mise`
- Erlang 28 / Elixir 1.19 via `mise`
- Chromium for Playwright validation
- Symphony built from `odysseus0/symphony`
- `systemd` service: `symphony-worker.service`

The bootstrap also:

- creates a dedicated `symphony` user
- clones this repo to `/opt/alfab-symphony-config`
- clones Symphony to `/opt/symphony`
- logs `codex` in using `OPENAI_API_KEY` or a copied auth file
- logs `gh` in using `GITHUB_TOKEN`
- stores only the runtime `LINEAR_API_KEY` in `/etc/symphony-worker.env`

It does not configure the Linear MCP on the worker by default. The committed [WORKFLOW.md](/Users/marzella/Documents/projects/archive/alfab/WORKFLOW.md) uses Symphony's injected `linear_graphql` tool instead.

## Required secrets

- `LINEAR_API_KEY`
- `GITHUB_TOKEN`

You need one Codex auth path:

- `OPENAI_API_KEY`, or
- `CODEX_AUTH_JSON_B64` generated from `~/.codex/auth.json`

`GITHUB_TOKEN` should be a classic PAT with at least `repo`, `read:org`, and `gist`.

## One-command DigitalOcean provision

Prereqs on the machine running the helper:

- `doctl` installed and authenticated
- at least one SSH key already uploaded to the DigitalOcean account
- SSH access to the created Droplet

From this repo root:

```bash
LINEAR_API_KEY='<linear-token>' \
GITHUB_TOKEN='<github-token>' \
./scripts/provision-do-symphony-worker.sh
```

If `OPENAI_API_KEY` is not set, the helper falls back to the local `~/.codex/auth.json` file when present.
If `GITHUB_TOKEN` is not set, the helper falls back to the locally authenticated GitHub CLI token when available.

Useful optional envs:

- `WORKER_NAME` defaults to `alfab-symphony-worker`
- `DO_REGION` defaults to `syd1`
- `DO_SIZE` defaults to `s-2vcpu-4gb`
- `DO_IMAGE` defaults to `ubuntu-24-04-x64`
- `DO_PROJECT_ID` optionally assigns the Droplet to a DO project
- `DO_SSH_KEY_ID` or `DO_SSH_KEY_FINGERPRINT` to force a specific SSH key
- `SSH_IDENTITY_FILE` if your local SSH client should use a non-default key file
- `SYMPHONY_DASHBOARD_PORT=4040` to enable the local-only Symphony dashboard

## Manual bootstrap on an existing VPS

Run on the VPS as root:

```bash
git clone --depth=1 https://github.com/motis-group/alfab.git /opt/alfab-bootstrap
LINEAR_API_KEY='<linear-token>' \
GITHUB_TOKEN='<github-token>' \
/opt/alfab-bootstrap/scripts/bootstrap-symphony-worker-vps.sh
```

For manual bootstrap without `OPENAI_API_KEY`, pass `CODEX_AUTH_JSON_B64="$(base64 < ~/.codex/auth.json | tr -d '\n')"` instead.

Optional envs:

- `WORKFLOW_REPO_URL` defaults to `https://github.com/motis-group/alfab.git`
- `WORKFLOW_REPO_BRANCH` defaults to `main`
- `WORKFLOW_REPO_DIR` defaults to `/opt/alfab-symphony-config`
- `SYMPHONY_REPO_URL` defaults to `https://github.com/odysseus0/symphony.git`
- `SYMPHONY_REPO_BRANCH` defaults to `main`
- `WORKSPACE_ROOT` defaults to `/home/symphony/code/symphony-workspaces`
- `SWAP_SIZE_GB` defaults to `4`
- `SYMPHONY_DASHBOARD_PORT` enables the localhost-only dashboard
- `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` override commit attribution

## Runtime layout

- Workflow repo: `/opt/alfab-symphony-config`
- Workflow file: `/opt/alfab-symphony-config/WORKFLOW.md`
- Symphony checkout: `/opt/symphony`
- Worker workspaces: `/home/symphony/code/symphony-workspaces`
- Service env: `/etc/symphony-worker.env`
- Logs: `/var/lib/symphony/logs`

## Operations

Check service state:

```bash
systemctl status symphony-worker --no-pager
journalctl -u symphony-worker -f
```

Check auth state:

```bash
sudo -u symphony codex login status
sudo -u symphony gh auth status
```

Update the workflow repo copy and restart:

```bash
git -C /opt/alfab-symphony-config fetch origin main --depth=1
git -C /opt/alfab-symphony-config checkout main
git -C /opt/alfab-symphony-config pull --ff-only origin main
systemctl restart symphony-worker
```

Update Symphony itself and restart:

```bash
git -C /opt/symphony fetch origin main --depth=1
git -C /opt/symphony checkout main
git -C /opt/symphony pull --ff-only origin main
sudo -u symphony env HOME=/home/symphony PATH=/usr/local/bin:/usr/bin:/bin:/home/symphony/.local/bin KERL_CONFIGURE_OPTIONS='--without-javac --without-odbc --without-wx' bash -lc 'cd /opt/symphony/elixir && mise trust && mise install && mise exec -- mix setup && mise exec -- mix build'
systemctl restart symphony-worker
```

## Dashboard access

If `SYMPHONY_DASHBOARD_PORT=4040` was set during bootstrap, Symphony binds the dashboard to `127.0.0.1:4040` on the VPS. Reach it through SSH tunneling:

```bash
ssh -L 4040:127.0.0.1:4040 root@<worker-ip>
```

Then open `http://127.0.0.1:4040` locally.
