#!/usr/bin/env bash
# Installs LibreDWG's dwg2dxf, which /api/cad/convert shells out to so the calculator can accept
# customer DWG drawings. Ubuntu does not package LibreDWG (it is Debian-only), so this builds the
# pinned upstream release from source and installs it under /usr/local.
#
# Safe to re-run: it exits early when a working dwg2dxf is already installed. Pass --force to rebuild.
#
#   sudo bash scripts/install-libredwg.sh
#
set -euo pipefail

LIBREDWG_VERSION="${LIBREDWG_VERSION:-0.13.4}"
LIBREDWG_SHA256="${LIBREDWG_SHA256:-cacff5510f46723462e854e15ecfa97cbc7475acb3eb7ae1ca6e4193ecc2267d}"
PREFIX="${PREFIX:-/usr/local}"
FORCE="${FORCE:-0}"

if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

log() {
  printf '[install-libredwg] %s\n' "$*"
}

run_as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

if [[ "${FORCE}" != "1" ]] && command -v dwg2dxf >/dev/null 2>&1; then
  log "dwg2dxf is already installed at $(command -v dwg2dxf)."
  dwg2dxf --version 2>&1 | head -n1 || true
  log "Nothing to do. Re-run with --force to rebuild."
  exit 0
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "This script targets Debian/Ubuntu hosts (apt-get not found)." >&2
  exit 1
fi

log "Installing build dependencies"
run_as_root apt-get update -y
run_as_root apt-get install -y --no-install-recommends build-essential pkg-config curl ca-certificates

work_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${work_dir}"
}
trap cleanup EXIT

tarball="${work_dir}/libredwg-${LIBREDWG_VERSION}.tar.gz"
url="https://github.com/LibreDWG/libredwg/releases/download/${LIBREDWG_VERSION}/libredwg-${LIBREDWG_VERSION}.tar.gz"

log "Downloading LibreDWG ${LIBREDWG_VERSION}"
curl -fsSL --retry 3 --retry-delay 2 -o "${tarball}" "${url}"

actual_sha="$(sha256sum "${tarball}" | awk '{print $1}')"
if [[ "${LIBREDWG_SHA256}" != "skip" && "${actual_sha}" != "${LIBREDWG_SHA256}" ]]; then
  echo "Checksum mismatch for ${url}" >&2
  echo "  expected: ${LIBREDWG_SHA256}" >&2
  echo "  actual:   ${actual_sha}" >&2
  echo "Refusing to build. Update LIBREDWG_SHA256 if the pinned release was re-published." >&2
  exit 1
fi
log "Checksum verified (${actual_sha})"

tar -xzf "${tarball}" -C "${work_dir}"
cd "${work_dir}/libredwg-${LIBREDWG_VERSION}"

# The bindings need SWIG plus Python/Perl headers and are not used here; skipping them keeps the
# dependency list small and the build short enough for a 1 GB droplet.
log "Configuring"
./configure --prefix="${PREFIX}" --disable-bindings --disable-python --disable-shared --enable-release >"${work_dir}/configure.log" 2>&1 || {
  tail -n 40 "${work_dir}/configure.log" >&2
  echo "configure failed; see output above." >&2
  exit 1
}

# Small droplets run out of memory with a wide parallel build, so cap the job count.
jobs="$(nproc 2>/dev/null || echo 1)"
if [[ "${jobs}" -gt 2 ]]; then
  jobs=2
fi

log "Building with ${jobs} job(s), this can take several minutes"
make -j"${jobs}" >"${work_dir}/build.log" 2>&1 || {
  tail -n 40 "${work_dir}/build.log" >&2
  echo "build failed; see output above." >&2
  exit 1
}

log "Installing to ${PREFIX}"
run_as_root make install >"${work_dir}/install.log" 2>&1 || {
  tail -n 40 "${work_dir}/install.log" >&2
  echo "install failed; see output above." >&2
  exit 1
}

run_as_root ldconfig || true

if ! command -v dwg2dxf >/dev/null 2>&1; then
  echo "dwg2dxf was not found on PATH after install. Check that ${PREFIX}/bin is on PATH." >&2
  exit 1
fi

log "Installed: $(command -v dwg2dxf)"
dwg2dxf --version 2>&1 | head -n1 || true
log "Done. The calculator's DWG upload path is now available."
