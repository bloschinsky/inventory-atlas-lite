#!/usr/bin/env bash
# Installs Inventory Atlas Lite inside a Debian container. Run as root in the target container,
# not on the Proxmox host. scripts/proxmox-install.sh pushes and runs this automatically.
set -Eeuo pipefail

usage() {
  cat <<'TXT'
Usage: install.sh [--help]

Installs Inventory Atlas Lite into /opt/inventory-atlas-lite/app and runs it as a
systemd service. Must be run as root inside a Debian 12/13 container.

Environment variables:
  APP_VERSION   Release tag to install, or "latest" (default: latest).
  APP_BRANCH    Development override: install this branch instead of a release.
  PORT          Port the application listens on (default: 3000).

Persistent data stays in /var/lib/inventory-atlas-lite and is never replaced by
an installation or an update.
TXT
}

case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  '') ;;
  *) usage >&2; exit 2 ;;
esac

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)
if [ -f "$SCRIPT_DIR/lib.sh" ]; then
  # shellcheck source=scripts/lib.sh
  . "$SCRIPT_DIR/lib.sh"
else
  echo "[x] scripts/lib.sh is missing next to install.sh." >&2
  exit 1
fi

ial_require_root
[ -f /etc/debian_version ] || ial_die "This installer supports Debian containers only."

APP_VERSION=${APP_VERSION:-latest}
APP_BRANCH=${APP_BRANCH:-}
PORT=${PORT:-3000}
ial_check "port" "$PORT" ial_valid_port
if [ -n "$APP_BRANCH" ]; then
  ial_check "branch" "$APP_BRANCH" ial_valid_branch
  REF_KIND=branch
  REF=$APP_BRANCH
else
  ial_check "version" "$APP_VERSION" ial_valid_version
  REF_KIND=tag
  REF=$APP_VERSION
fi

WORK=''
STAGING=''
cleanup() {
  if [ -n "$WORK" ] && [ -d "$WORK" ]; then rm -rf "$WORK"; fi
  if [ -n "$STAGING" ] && [ -d "$STAGING" ]; then rm -rf "$STAGING"; fi
}
trap cleanup EXIT
trap 'ial_warn "Installation failed at line $LINENO."' ERR

install_packages() {
  ial_log "Installing system packages"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  # build-essential and python3 let npm rebuild better-sqlite3 when no prebuilt binary matches.
  apt-get install -y -qq --no-install-recommends \
    ca-certificates curl tar xz-utils git build-essential python3 >/dev/null
}

install_node() {
  if command -v node >/dev/null 2>&1 && node -v | grep -q "^v$IAL_NODE_MAJOR\."; then
    ial_log "Node.js $(node -v) is already installed"
    return 0
  fi
  local arch version tarball dist
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) ial_die "Unsupported architecture: $(uname -m)." ;;
  esac
  version=$(curl -fsSL --proto '=https' --tlsv1.2 --max-time 60 https://nodejs.org/dist/index.json \
    | grep -o "\"version\":\"v$IAL_NODE_MAJOR\.[0-9]\+\.[0-9]\+\"" | head -n 1 | sed 's/.*"\(v[^"]*\)"$/\1/')
  [ -n "$version" ] || ial_die "Could not resolve a Node.js $IAL_NODE_MAJOR release."
  ial_log "Installing Node.js $version ($arch)"
  tarball="node-$version-linux-$arch.tar.xz"
  dist="https://nodejs.org/dist/$version"
  curl -fsSL --proto '=https' --tlsv1.2 --max-time 300 -o "$WORK/$tarball" "$dist/$tarball"
  curl -fsSL --proto '=https' --tlsv1.2 --max-time 60 -o "$WORK/SHASUMS256.txt" "$dist/SHASUMS256.txt"
  ( cd "$WORK" && grep " $tarball\$" SHASUMS256.txt | sha256sum -c - >/dev/null ) \
    || ial_die "Checksum verification failed for $tarball."
  rm -rf "/usr/local/lib/nodejs/node-$version-linux-$arch"
  mkdir -p /usr/local/lib/nodejs
  tar -xJf "$WORK/$tarball" -C /usr/local/lib/nodejs
  local bin="/usr/local/lib/nodejs/node-$version-linux-$arch/bin"
  ln -sfn "$bin/node" /usr/local/bin/node
  ln -sfn "$bin/npm" /usr/local/bin/npm
  ln -sfn "$bin/npx" /usr/local/bin/npx
}

create_account() {
  if ! id -u "$IAL_USER" >/dev/null 2>&1; then
    ial_log "Creating the service account $IAL_USER"
    useradd --system --home-dir "$IAL_DATA_DIR" --shell /usr/sbin/nologin "$IAL_USER"
  fi
  install -d -o "$IAL_USER" -g "$IAL_USER" -m 0750 "$IAL_DATA_DIR" "$IAL_BACKUP_DIR"
}

write_env_file() {
  if [ -f "$IAL_ENV_FILE" ]; then
    ial_log "Keeping the existing $IAL_ENV_FILE"
    return 0
  fi
  ial_log "Writing $IAL_ENV_FILE"
  cat >"$IAL_ENV_FILE" <<ENV
NODE_ENV=production
PORT=$PORT
DATA_DIR=$IAL_DATA_DIR
ENV
  chown root:"$IAL_USER" "$IAL_ENV_FILE"
  chmod 0640 "$IAL_ENV_FILE"
}

install_service() {
  ial_log "Installing the systemd service"
  install -m 0644 "$IAL_APP_DIR/deploy/$IAL_SERVICE.service" "/etc/systemd/system/$IAL_SERVICE.service"
  install -m 0755 "$IAL_APP_DIR/scripts/lib.sh" "$IAL_APP_ROOT/lib.sh"
  install -m 0750 "$IAL_APP_DIR/scripts/update.sh" "$IAL_UPDATE_COMMAND"
  systemctl daemon-reload
  systemctl enable "$IAL_SERVICE" >/dev/null
}

WORK=$(mktemp -d)
install_packages
install_node
create_account

if [ "$REF_KIND" = tag ] && [ "$REF" = latest ]; then
  REF=$(ial_latest_tag)
  ial_log "Latest release resolved to $REF"
fi
SOURCE=$(ial_fetch_source "$REF_KIND" "$REF" "$WORK")
ial_build_app "$SOURCE"

mkdir -p "$IAL_APP_ROOT"
STAGING=$(mktemp -d "$IAL_APP_ROOT/.staging.XXXXXX")
cp -a "$SOURCE/." "$STAGING/"
chown -R root:root "$STAGING"
chmod -R u=rwX,go=rX "$STAGING"

if systemctl is-active --quiet "$IAL_SERVICE"; then
  systemctl stop "$IAL_SERVICE"
fi
ial_install_code "$STAGING"
STAGING=''
write_env_file
install_service

ial_log "Starting $IAL_SERVICE"
systemctl restart "$IAL_SERVICE"
if ! ial_wait_for_health "http://127.0.0.1:$PORT/api/health" 120; then
  ial_die "The service did not become healthy. Inspect it with: journalctl -u $IAL_SERVICE -n 50"
fi

ial_log "Inventory Atlas Lite $(ial_app_version "$IAL_APP_DIR") is installed and healthy."
