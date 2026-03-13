# Symphony Worker VPS

This host should run Symphony in a multi-project layout:

- one shared Symphony runtime on the VPS
- one `systemd` service instance per Linear project
- one workflow repo clone and one workspace root per instance

The binding between a service and a Linear project lives in that instance's `WORKFLOW.md`, specifically `tracker.project_slug`. The team still provides the workflow/status namespace, but Symphony polls the project slug, not the whole team.

## Recommended baseline

- Provider: DigitalOcean Basic Droplet
- Region: `syd1`
- OS: Ubuntu 24.04 LTS
- Size: `s-2vcpu-4gb`
- Public IP: 1 static IPv4

Use a bigger box if you expect multiple active agents, heavy builds, or browser validation across several repos.

## Layout

Shared host assets:

- Symphony repo: `/opt/symphony`
- Instance template unit: `/etc/systemd/system/symphony-worker@.service`
- Instance launcher: `/usr/local/bin/symphony-worker-instance-start`
- Shared config/auth user: `symphony`
- Shared browsers path: `/opt/playwright`

Per-project instance assets:

- Service name: `symphony-worker@<instance>.service`
- Instance env file: `/etc/symphony-worker/<instance>.env`
- Workflow repo clone: `/opt/symphony-projects/<instance>/repo`
- Workspace root: `/home/symphony/code/symphony-workspaces/<instance>`
- Logs root: `/var/lib/symphony/logs/<instance>`

## What the scripts do

[bootstrap-symphony-worker-host.sh](/Users/marzella/Documents/projects/archive/alfab/scripts/bootstrap-symphony-worker-host.sh):

- installs Node.js, Codex CLI, `gh`, `mise`, Erlang/Elixir, and Playwright Chromium
- clones and builds Symphony once
- logs `codex` and `gh` in for the shared `symphony` user
- writes the shared instance launcher and `systemd` template

[register-symphony-worker-project.sh](/Users/marzella/Documents/projects/archive/alfab/scripts/register-symphony-worker-project.sh):

- clones or updates one workflow repo
- writes `/etc/symphony-worker/<instance>.env`
- enables and starts `symphony-worker@<instance>.service`

[bootstrap-symphony-worker-vps.sh](/Users/marzella/Documents/projects/archive/alfab/scripts/bootstrap-symphony-worker-vps.sh):

- compatibility wrapper that bootstraps the shared host and then registers one project instance

[provision-do-symphony-worker.sh](/Users/marzella/Documents/projects/archive/alfab/scripts/provision-do-symphony-worker.sh):

- creates the DigitalOcean Droplet
- runs the compatibility bootstrap for the first project instance

## Required secrets

- `LINEAR_API_KEY`
- `GITHUB_TOKEN`

You need one Codex auth path:

- `OPENAI_API_KEY`, or
- `CODEX_AUTH_JSON_B64` generated from `~/.codex/auth.json`

`GITHUB_TOKEN` should have at least `repo`, `read:org`, and `gist`.

## First project on a new host

From this repo root:

```bash
LINEAR_API_KEY='<linear-token>' \
WORKER_INSTANCE='alfab' \
SYMPHONY_DASHBOARD_PORT='4040' \
./scripts/provision-do-symphony-worker.sh
```

If `OPENAI_API_KEY` is not set, the helper falls back to the local `~/.codex/auth.json` file when present.
If `GITHUB_TOKEN` is not set, the helper falls back to the locally authenticated GitHub CLI token when available.

Useful optional envs:

- `WORKER_NAME` defaults to `alfab-symphony-worker`
- `DO_REGION` defaults to `syd1`
- `DO_SIZE` defaults to `s-2vcpu-4gb`
- `DO_PROJECT_ID` optionally assigns the Droplet to a DO project
- `DO_SSH_KEY_ID` or `DO_SSH_KEY_FINGERPRINT` to force a specific SSH key
- `SSH_IDENTITY_FILE` to force a local private key

## Existing host bootstrap

Run once on the VPS as root:

```bash
git clone --depth=1 https://github.com/motis-group/alfab.git /opt/alfab-bootstrap
GITHUB_TOKEN='<github-token>' \
/opt/alfab-bootstrap/scripts/bootstrap-symphony-worker-host.sh
```

Pass `OPENAI_API_KEY='<openai-token>'` or `CODEX_AUTH_JSON_B64="$(base64 < ~/.codex/auth.json | tr -d '\n')"` as well.

## Add another project on the same host

Run on the VPS as root:

```bash
LINEAR_API_KEY='<linear-token>' \
WORKER_INSTANCE='repo2' \
WORKFLOW_REPO_URL='https://github.com/your-org/repo2.git' \
WORKFLOW_REPO_BRANCH='main' \
WORKFLOW_FILE_RELATIVE_PATH='WORKFLOW.md' \
SYMPHONY_DASHBOARD_PORT='4041' \
/opt/alfab-bootstrap/scripts/register-symphony-worker-project.sh
```

Important constraints:

- `WORKER_INSTANCE` must be unique per project
- `SYMPHONY_DASHBOARD_PORT`, if set, must be unique per instance
- the workflow repo must contain the correct `WORKFLOW.md` for that repo/project
- the `WORKFLOW.md` must point at the intended Linear project slug

## Operations

Status for one instance:

```bash
systemctl status symphony-worker@alfab --no-pager
journalctl -u symphony-worker@alfab -f
```

List all Symphony instances:

```bash
systemctl list-units 'symphony-worker@*'
```

Restart one instance after workflow changes:

```bash
git -C /opt/symphony-projects/alfab/repo fetch origin main --depth=1
git -C /opt/symphony-projects/alfab/repo checkout main
git -C /opt/symphony-projects/alfab/repo pull --ff-only origin main
systemctl restart symphony-worker@alfab
```

Update Symphony itself:

```bash
git -C /opt/symphony fetch origin main --depth=1
git -C /opt/symphony checkout main
git -C /opt/symphony pull --ff-only origin main
sudo -u symphony env HOME=/home/symphony PATH=/usr/local/bin:/usr/bin:/bin:/home/symphony/.local/bin KERL_CONFIGURE_OPTIONS='--without-javac --without-odbc --without-wx' bash -lc 'cd /opt/symphony/elixir && mise trust && mise install && mise exec -- mix setup && mise exec -- mix build'
systemctl restart 'symphony-worker@*'
```

Check shared auth:

```bash
sudo -u symphony codex login status
sudo -u symphony gh auth status
```

## Dashboard access

Each instance can optionally expose its own localhost-only dashboard port. Tunnel the port you assigned:

```bash
ssh -L 4040:127.0.0.1:4040 root@<worker-ip>
```

Then open `http://127.0.0.1:4040` locally.
