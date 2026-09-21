#!/usr/bin/env bash
# Shared helpers for the Inventory Atlas Lite deployment scripts.
# Sourced by install.sh and update.sh inside the container, and by proxmox-install.sh on the host.

# These constants are read by the scripts that source this file, which shellcheck cannot see.
# shellcheck disable=SC2034
IAL_REPO_OWNER=${IAL_REPO_OWNER:-bloschinsky}
IAL_REPO_NAME=${IAL_REPO_NAME:-inventory-atlas-lite}
IAL_SERVICE=inventory-atlas-lite
IAL_USER=inventory-atlas
IAL_APP_ROOT=/opt/inventory-atlas-lite
IAL_APP_DIR=$IAL_APP_ROOT/app
IAL_DATA_DIR=/var/lib/inventory-atlas-lite
IAL_BACKUP_DIR=$IAL_DATA_DIR/backups
IAL_ENV_FILE=/etc/inventory-atlas-lite.env
IAL_UPDATE_COMMAND=/usr/local/sbin/inventory-atlas-lite-update
# Pinned Node.js LTS major; the exact patch release inside this line is resolved at install time.
IAL_NODE_MAJOR=22
IAL_KEEP_BACKUPS=5

# pct exec provides PATH=/sbin:/bin:/usr/sbin:/usr/bin, without the /usr/local/bin that Node.js is
# installed into. npm is then unreachable by name, and its "#!/usr/bin/env node" shebang fails too.
case ":$PATH:" in
  *:/usr/local/bin:*) ;;
  *) PATH="/usr/local/bin:$PATH" ;;
esac
export PATH

# Progress goes to stderr because callers capture the stdout of several helpers below.
ial_log() { printf '\033[0;32m==>\033[0m %s\n' "$*" >&2; }
ial_warn() { printf '\033[0;33m[!]\033[0m %s\n' "$*" >&2; }
ial_die() { printf '\033[0;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

ial_require_root() {
  [ "$(id -u)" = "0" ] || ial_die "This script must be run as root."
}

# --- validation -------------------------------------------------------------
# Every value that reaches a Proxmox command, a URL, or a systemd unit passes through here first.

ial_valid_int() { # value min max
  case $1 in ''|*[!0-9]*) return 1 ;; esac
  [ "$1" -ge "$2" ] && [ "$1" -le "$3" ]
}
ial_valid_ctid() { ial_valid_int "$1" 100 999999999; }
ial_valid_port() { ial_valid_int "$1" 1 65535; }
ial_valid_hostname() {
  printf '%s' "$1" | grep -Eq '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
}
ial_valid_bridge() {
  printf '%s' "$1" | grep -Eq '^[a-zA-Z][a-zA-Z0-9_.-]{0,14}$'
}
ial_valid_storage() {
  printf '%s' "$1" | grep -Eq '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'
}
ial_valid_ipv4() {
  printf '%s' "$1" | grep -Eq '^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])$'
}
# Accepts "dhcp" or a static "address/prefix" such as 192.168.1.50/24.
ial_valid_ipv4_config() {
  [ "$1" = dhcp ] && return 0
  case $1 in */*) ;; *) return 1 ;; esac
  local address=${1%%/*} prefix=${1##*/}
  ial_valid_ipv4 "$address" && ial_valid_int "$prefix" 1 32
}
ial_valid_version() {
  [ "$1" = latest ] && return 0
  printf '%s' "$1" | grep -Eq '^v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'
}
ial_valid_branch() {
  case $1 in *..*|-*) return 1 ;; esac
  printf '%s' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._/-]{0,98}$'
}
ial_check() { # description value validator
  "$3" "$2" || ial_die "Invalid $1: '$2'."
}

# --- release handling -------------------------------------------------------

ial_latest_tag() {
  local body tag
  body=$(curl -fsSL --proto '=https' --tlsv1.2 --retry 3 --max-time 30 \
    "https://api.github.com/repos/$IAL_REPO_OWNER/$IAL_REPO_NAME/releases/latest") \
    || ial_die "Could not query the latest release. Set APP_VERSION to an explicit tag."
  tag=$(printf '%s' "$body" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/')
  [ -n "$tag" ] || ial_die "No published release found. Set APP_VERSION to an explicit tag."
  printf '%s' "$tag"
}

ial_verify_checksum() { # archive sumsfile
  local actual
  actual=$(sha256sum "$1" | cut -d' ' -f1)
  grep -qi "^$actual " "$2" || ial_die "Checksum verification failed for the downloaded release."
  ial_log "Release checksum verified."
}

ial_download() { # url destination
  curl -fsSL --proto '=https' --tlsv1.2 --retry 3 --max-time 300 -o "$2" "$1"
}

# Downloads, verifies and extracts the source archive. Prints the extracted directory.
# Usage: ial_fetch_source <tag|branch> <ref> <work-dir>
ial_fetch_source() {
  local kind=$1 ref=$2 work=$3 base archive sums asset
  base="https://github.com/$IAL_REPO_OWNER/$IAL_REPO_NAME"
  archive="$work/source.tar.gz"
  sums="$work/SHA256SUMS"
  if [ "$kind" = branch ]; then
    ial_warn "Installing development ref '$ref' without checksum verification."
    ial_log "Downloading branch $ref"
    ial_download "$base/archive/refs/heads/$ref.tar.gz" "$archive"       || ial_die "Could not download branch '$ref'."
  else
    asset="$base/releases/download/$ref/$IAL_REPO_NAME-$ref.tar.gz"
    if ial_log "Downloading release $ref" && ial_download "$asset" "$archive"; then
      # A published release always ships its checksums, so verification is mandatory here.
      ial_download "$base/releases/download/$ref/SHA256SUMS" "$sums"         || ial_die "Release $ref publishes an archive but no SHA256SUMS."
      ial_verify_checksum "$archive" "$sums"
    else
      ial_warn "Release $ref has no archive asset; falling back to the GitHub source archive."
      ial_download "$base/archive/refs/tags/$ref.tar.gz" "$archive"         || ial_die "Could not download '$ref'. Check that the release exists and is public."
      if ial_download "$base/releases/download/$ref/SHA256SUMS" "$sums"; then
        ial_verify_checksum "$archive" "$sums"
      else
        ial_warn "Release $ref publishes no SHA256SUMS; the download is protected by HTTPS only."
      fi
    fi
  fi
  [ -s "$archive" ] || ial_die "The downloaded archive is empty."
  mkdir -p "$work/source"
  tar -xzf "$archive" -C "$work/source" --strip-components=1     || ial_die "Could not extract the downloaded archive."
  [ -f "$work/source/package.json" ] || ial_die "The downloaded archive does not look like Inventory Atlas Lite."
  printf '%s' "$work/source"
}

# Picks the newest Debian template for one architecture. The catalogue lists several
# architectures under the same name, and a plain version sort would prefer arm64 over amd64.
ial_resolve_template() { # debian major version, dpkg architecture
  pveam available --section system 2>/dev/null \
    | awk '{ print $2 }' | grep -E "^debian-$1-standard_.*_$2\.tar" | sort -V | tail -n 1
}

ial_app_version() { # source directory
  grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$1/package.json" | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/'
}

# --- build and code placement ----------------------------------------------

ial_build_app() { # source directory
  ial_log "Installing dependencies from the committed lockfile"
  # onnxruntime-node downloads the CUDA and TensorRT execution providers on linux/x64 unless it is
  # told not to, and unpacking them is what the OOM killer stops in a default 1 GiB container. The
  # application only ever creates CPU sessions. The release also carries .npmrc for the same reason,
  # because an older installed updater runs this step from its own copy of this file.
  ( cd "$1" && ONNXRUNTIME_NODE_INSTALL=skip npm ci --no-audit --no-fund ) || ial_die "npm ci failed."
  ial_log "Building the production client"
  ( cd "$1" && npm run build ) || ial_die "The production build failed."
  ial_log "Removing development-only dependencies"
  ( cd "$1" && npm prune --omit=dev --no-audit --no-fund ) || ial_warn "Could not prune development dependencies."
  rm -rf "$1/.git" "$1/test" "$1/test-results"
}

# Moves the staged code into place, keeping the replaced code for rollback.
# The staging directory must live on the same filesystem, so both are under $IAL_APP_ROOT.
ial_install_code() { # staging directory
  rm -rf "$IAL_APP_ROOT/previous"
  mkdir -p "$IAL_APP_ROOT"
  if [ -d "$IAL_APP_DIR" ]; then
    mv "$IAL_APP_DIR" "$IAL_APP_ROOT/previous"
  fi
  mv "$1" "$IAL_APP_DIR"
}

ial_rollback_code() {
  [ -d "$IAL_APP_ROOT/previous" ] || return 1
  rm -rf "$IAL_APP_DIR"
  mv "$IAL_APP_ROOT/previous" "$IAL_APP_DIR"
}

ial_wait_for_health() { # url [timeout-seconds] [expected-version]
  local deadline now response expected_version
  expected_version=${3:-}
  now=$(date +%s)
  deadline=$(( now + ${2:-120} ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if response=$(curl -fsS --max-time 5 "$1" 2>/dev/null) \
      && printf '%s' "$response" | grep -Fq '"status":"ok"'; then
      if [ -z "$expected_version" ] \
        || printf '%s' "$response" | grep -Fq "\"version\":\"$expected_version\""; then
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}
