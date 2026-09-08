#!/usr/bin/env bash
# Builds LibreDWG's dwg2dxf, which /api/cad/convert shells out to so the calculator can accept
# customer DWG drawings. Ubuntu does not package LibreDWG (it is Debian-only), so this builds the
# pinned upstream release from source.
#
# Safe to re-run: it exits early when a working dwg2dxf is already installed. Pass --force to rebuild.
#
#   sudo bash scripts/install-libredwg.sh
#
# Environment:
#   PREFIX       install prefix (default /usr/local)
#   BUILD_ONLY   1 to build and stage into PREFIX without touching the system or checking PATH.
#                Used by the deploy workflow to build on a CI runner and ship the binary, so a
#                small production droplet never has to run the compile itself.
#   FORCE        1 to rebuild even when dwg2dxf is already present
#
set -euo pipefail

LIBREDWG_VERSION="${LIBREDWG_VERSION:-0.13.4}"
LIBREDWG_SHA256="${LIBREDWG_SHA256:-cacff5510f46723462e854e15ecfa97cbc7475acb3eb7ae1ca6e4193ecc2267d}"
PREFIX="${PREFIX:-/usr/local}"
BUILD_ONLY="${BUILD_ONLY:-0}"
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

# Staging into a writable prefix does not need root; installing into /usr/local does.
install_cmd() {
  if [[ "${BUILD_ONLY}" == "1" ]]; then
    "$@"
  else
    run_as_root "$@"
  fi
}

if [[ "${BUILD_ONLY}" != "1" && "${FORCE}" != "1" ]] && command -v dwg2dxf >/dev/null 2>&1; then
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
# dependency list small and the build short. --disable-shared links libredwg into the binaries, so
# the resulting dwg2dxf needs only libc and libm and can be copied to another host of the same
# distribution.
log "Configuring"
./configure --prefix="${PREFIX}" --disable-bindings --disable-python --disable-shared --enable-release >"${work_dir}/configure.log" 2>&1 || {
  tail -n 40 "${work_dir}/configure.log" >&2
  echo "configure failed; see output above." >&2
  exit 1
}

jobs="$(nproc 2>/dev/null || echo 1)"
if [[ "${BUILD_ONLY}" != "1" && "${jobs}" -gt 2 ]]; then
  # A production droplet is small, so cap parallelism there. CI runners build with everything.
  jobs=2
fi

log "Building with ${jobs} job(s), this can take several minutes"
make -j"${jobs}" >"${work_dir}/build.log" 2>&1 || {
  tail -n 40 "${work_dir}/build.log" >&2
  echo "build failed; see output above." >&2
  exit 1
}

log "Installing to ${PREFIX}"
install_cmd make install >"${work_dir}/install.log" 2>&1 || {
  tail -n 40 "${work_dir}/install.log" >&2
  echo "install failed; see output above." >&2
  exit 1
}

# Unstripped the binary is ~70 MB of debug info, which is pointless to keep or to copy over the wire.
install_cmd strip "${PREFIX}/bin/dwg2dxf" || true

if [[ "${BUILD_ONLY}" == "1" ]]; then
  if [[ ! -x "${PREFIX}/bin/dwg2dxf" ]]; then
    echo "Build finished but ${PREFIX}/bin/dwg2dxf is missing." >&2
    exit 1
  fi
  log "Staged: ${PREFIX}/bin/dwg2dxf ($(du -h "${PREFIX}/bin/dwg2dxf" | cut -f1))"
  "${PREFIX}/bin/dwg2dxf" --version 2>&1 | head -n1 || true
  exit 0
fi

run_as_root ldconfig || true

if ! command -v dwg2dxf >/dev/null 2>&1; then
  echo "dwg2dxf was not found on PATH after install. Check that ${PREFIX}/bin is on PATH." >&2
  exit 1
fi

log "Installed: $(command -v dwg2dxf)"
dwg2dxf --version 2>&1 | head -n1 || true
log "Done. The calculator's DWG upload path is now available."
