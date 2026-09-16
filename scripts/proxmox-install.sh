#!/usr/bin/env bash
# Creates an unprivileged Debian LXC on a Proxmox VE host and installs Inventory Atlas Lite in it.
# Run in the shell of the Proxmox VE host as root.
set -Eeuo pipefail

usage() {
  cat <<'TXT'
Usage: proxmox-install.sh [-y|--yes] [--help]

Creates an unprivileged Debian LXC on this Proxmox VE host and installs
Inventory Atlas Lite inside it. Must be run as root on the Proxmox VE host.

Options:
  -y, --yes   Do not ask for confirmation before creating the container.

Environment variables (defaults in brackets):
  CTID              Container ID [next free ID]
  CT_HOSTNAME       Container hostname [inventory-atlas-lite]
  STORAGE           Storage for the root disk [first active rootdir storage]
  TEMPLATE_STORAGE  Storage holding LXC templates [local, or first active one]
  BRIDGE            Network bridge [vmbr0]
  DISK_GB           Root disk size in GiB [8]
  CORES             CPU cores [1]
  RAM_MB            Memory in MiB [1024]
  SWAP_MB           Swap in MiB [512]
  IPV4              "dhcp" or a static address such as 192.168.1.50/24 [dhcp]
  GATEWAY           Gateway for a static address [unset]
  OS_VERSION        Debian major version, 13 or 12 [13, falling back to 12]
  PORT              Application port [3000]
  APP_VERSION       Release tag to install, or "latest" [latest]
  APP_BRANCH        Development override: install this branch instead of a release
  INSTALLER_REF     Ref used to fetch the container scripts [the resolved release tag]

The script never reuses or destroys an existing container ID and does not change
unrelated Proxmox host configuration.
TXT
}

ASSUME_YES=${NON_INTERACTIVE:-0}
while [ $# -gt 0 ]; do
  case $1 in
    --help|-h) usage; exit 0 ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    *) usage >&2; exit 2 ;;
  esac
done

TMPDIR_RUN=$(mktemp -d)
CREATED_CTID=''
cleanup() {
  rm -rf "$TMPDIR_RUN"
  if [ -n "$CREATED_CTID" ]; then
    pct exec "$CREATED_CTID" -- rm -f /root/install.sh /root/lib.sh >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

RAW_BASE="https://raw.githubusercontent.com/${IAL_REPO_OWNER:-bloschinsky}/${IAL_REPO_NAME:-inventory-atlas-lite}"

# Downloads a script to a file and rejects anything that is not a shell script before it is used.
fetch_script() { # url destination
  curl -fsSL --proto '=https' --tlsv1.2 --retry 3 --max-time 60 -o "$2" "$1" \
    || { echo "[x] Could not download $1" >&2; exit 1; }
  head -n 1 "$2" | grep -q '^#!/usr/bin/env bash$' \
    || { echo "[x] $1 did not return a shell script." >&2; exit 1; }
}

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo .)
if [ -f "$SCRIPT_DIR/lib.sh" ]; then
  # shellcheck source=scripts/lib.sh
  . "$SCRIPT_DIR/lib.sh"
else
  fetch_script "$RAW_BASE/${INSTALLER_REF:-master}/scripts/lib.sh" "$TMPDIR_RUN/lib.sh"
  # shellcheck source=scripts/lib.sh
  . "$TMPDIR_RUN/lib.sh"
fi

report_failure() {
  ial_warn "Failed at line $1."
  if [ -n "$CREATED_CTID" ]; then
    ial_warn "Container $CREATED_CTID was created by this run and was left in place for inspection: pct status $CREATED_CTID"
  fi
}
trap 'report_failure "$LINENO"' ERR

ial_require_root
command -v pveversion >/dev/null 2>&1 || ial_die "This script must run on a Proxmox VE host."
for required in pct pveam pvesm pvesh; do
  command -v "$required" >/dev/null 2>&1 || ial_die "Required Proxmox command '$required' is missing."
done

# --- configuration ----------------------------------------------------------

active_storages() { # content type
  pvesm status --content "$1" 2>/dev/null | awk 'NR > 1 && $3 == "active" { print $1 }'
}
pick_storage() { # content type, preferred names in order
  local content=$1 available preferred
  shift
  available=$(active_storages "$content")
  [ -n "$available" ] || return 1
  for preferred in "$@"; do
    if printf '%s\n' "$available" | grep -qx "$preferred"; then
      printf '%s' "$preferred"
      return 0
    fi
  done
  printf '%s\n' "$available" | head -n 1
}

CTID=${CTID:-$(pvesh get /cluster/nextid)}
CT_HOSTNAME=${CT_HOSTNAME:-inventory-atlas-lite}
STORAGE=${STORAGE:-$(pick_storage rootdir local-lvm local-zfs local)}
TEMPLATE_STORAGE=${TEMPLATE_STORAGE:-$(pick_storage vztmpl local)}
BRIDGE=${BRIDGE:-vmbr0}
DISK_GB=${DISK_GB:-8}
CORES=${CORES:-1}
RAM_MB=${RAM_MB:-1024}
SWAP_MB=${SWAP_MB:-512}
IPV4=${IPV4:-dhcp}
GATEWAY=${GATEWAY:-}
OS_VERSION=${OS_VERSION:-13}
PORT=${PORT:-3000}
APP_VERSION=${APP_VERSION:-latest}
APP_BRANCH=${APP_BRANCH:-}

[ -n "$STORAGE" ] || ial_die "No active storage for container disks was found. Set STORAGE explicitly."
[ -n "$TEMPLATE_STORAGE" ] || ial_die "No active storage for LXC templates was found. Set TEMPLATE_STORAGE explicitly."

ial_check "container ID" "$CTID" ial_valid_ctid
ial_check "hostname" "$CT_HOSTNAME" ial_valid_hostname
ial_check "storage" "$STORAGE" ial_valid_storage
ial_check "template storage" "$TEMPLATE_STORAGE" ial_valid_storage
ial_check "bridge" "$BRIDGE" ial_valid_bridge
ial_valid_int "$DISK_GB" 4 2048 || ial_die "Invalid disk size: '$DISK_GB' (4-2048 GiB)."
ial_valid_int "$CORES" 1 64 || ial_die "Invalid core count: '$CORES' (1-64)."
ial_valid_int "$RAM_MB" 512 65536 || ial_die "Invalid memory size: '$RAM_MB' (512-65536 MiB)."
ial_valid_int "$SWAP_MB" 0 65536 || ial_die "Invalid swap size: '$SWAP_MB' (0-65536 MiB)."
ial_check "IPv4 configuration" "$IPV4" ial_valid_ipv4_config
ial_check "port" "$PORT" ial_valid_port
ial_valid_int "$OS_VERSION" 12 13 || ial_die "Invalid Debian version: '$OS_VERSION' (12 or 13)."
if [ "$IPV4" = dhcp ]; then
  [ -z "$GATEWAY" ] || ial_die "A gateway cannot be combined with DHCP."
else
  ial_check "gateway" "$GATEWAY" ial_valid_ipv4
fi

if [ -n "$APP_BRANCH" ]; then
  ial_check "branch" "$APP_BRANCH" ial_valid_branch
  REF_KIND=branch
  REF=$APP_BRANCH
else
  ial_check "version" "$APP_VERSION" ial_valid_version
  REF_KIND=tag
  REF=$APP_VERSION
  if [ "$REF" = latest ]; then
    REF=$(ial_latest_tag)
  fi
fi
SCRIPT_REF=${INSTALLER_REF:-$REF}

if pct status "$CTID" >/dev/null 2>&1 || [ -f "/etc/pve/lxc/$CTID.conf" ]; then
  ial_die "Container $CTID already exists. Choose a free ID with CTID=<id>."
fi

cat <<SUMMARY

  Inventory Atlas Lite - Proxmox installation

  Container ID     $CTID
  Hostname         $CT_HOSTNAME
  Debian           $OS_VERSION (unprivileged LXC)
  Disk             $DISK_GB GiB on $STORAGE
  CPU / RAM / Swap $CORES core(s) / $RAM_MB MiB / $SWAP_MB MiB
  Network          $BRIDGE, IPv4 $IPV4${GATEWAY:+, gateway $GATEWAY}
  Application      $REF on port $PORT

SUMMARY

if [ "$ASSUME_YES" != 1 ]; then
  read -r -p "Create this container? [Y/n] " answer
  case ${answer:-y} in
    [Yy]*) ;;
    *) ial_die "Cancelled. Nothing was changed." ;;
  esac
fi

# --- template ---------------------------------------------------------------

HOST_ARCH=$(dpkg --print-architecture)
ial_log "Refreshing the template catalogue"
pveam update >/dev/null 2>&1 || ial_warn "Could not refresh the template catalogue; using the cached list."
TEMPLATE=$(ial_resolve_template "$OS_VERSION" "$HOST_ARCH")
if [ -z "$TEMPLATE" ] && [ "$OS_VERSION" = 13 ]; then
  ial_warn "No Debian 13 template is available on this node; falling back to Debian 12."
  OS_VERSION=12
  TEMPLATE=$(ial_resolve_template 12 "$HOST_ARCH")
fi
[ -n "$TEMPLATE" ] || ial_die "No Debian $OS_VERSION $HOST_ARCH LXC template is available on this node."

if pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep -qF "$TEMPLATE"; then
  ial_log "Template $TEMPLATE is already present"
else
  ial_log "Downloading template $TEMPLATE to $TEMPLATE_STORAGE"
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE" >/dev/null
fi

# --- container --------------------------------------------------------------

NET0="name=eth0,bridge=$BRIDGE,ip=$IPV4"
[ -n "$GATEWAY" ] && NET0="$NET0,gw=$GATEWAY"

ial_log "Creating unprivileged container $CTID"
pct create "$CTID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" \
  --hostname "$CT_HOSTNAME" \
  --unprivileged 1 \
  --onboot 1 \
  --cores "$CORES" \
  --memory "$RAM_MB" \
  --swap "$SWAP_MB" \
  --rootfs "$STORAGE:$DISK_GB" \
  --net0 "$NET0" >/dev/null
CREATED_CTID=$CTID

ial_log "Starting container $CTID"
pct start "$CTID" >/dev/null

ial_log "Waiting for container networking"
CT_IP=''
for _ in $(seq 1 60); do
  CT_IP=$(pct exec "$CTID" -- ip -4 -o addr show dev eth0 2>/dev/null | awk '{ print $4 }' | cut -d/ -f1 | head -n 1 || true)
  if [ -n "$CT_IP" ] && pct exec "$CTID" -- getent hosts github.com >/dev/null 2>&1; then
    break
  fi
  CT_IP=''
  sleep 2
done
[ -n "$CT_IP" ] || ial_die "Container $CTID did not get working networking within the timeout."
ial_log "Container address is $CT_IP"

# --- application ------------------------------------------------------------

if [ -f "$SCRIPT_DIR/install.sh" ] && [ -f "$SCRIPT_DIR/lib.sh" ]; then
  cp "$SCRIPT_DIR/install.sh" "$SCRIPT_DIR/lib.sh" "$TMPDIR_RUN/"
else
  fetch_script "$RAW_BASE/$SCRIPT_REF/scripts/install.sh" "$TMPDIR_RUN/install.sh"
  fetch_script "$RAW_BASE/$SCRIPT_REF/scripts/lib.sh" "$TMPDIR_RUN/lib.sh"
fi
pct push "$CTID" "$TMPDIR_RUN/install.sh" /root/install.sh --perms 0700
pct push "$CTID" "$TMPDIR_RUN/lib.sh" /root/lib.sh --perms 0700

ial_log "Installing Inventory Atlas Lite inside the container"
if [ "$REF_KIND" = branch ]; then
  pct exec "$CTID" -- env "PORT=$PORT" "APP_BRANCH=$REF" bash /root/install.sh
else
  pct exec "$CTID" -- env "PORT=$PORT" "APP_VERSION=$REF" bash /root/install.sh
fi

ial_log "Verifying the application from the host"
ial_wait_for_health "http://$CT_IP:$PORT/api/health" 120 \
  || ial_die "Container $CTID is running but /api/health did not answer. Inspect: pct exec $CTID -- journalctl -u $IAL_SERVICE -n 50"

cat <<DONE

Inventory Atlas Lite is ready:
http://$CT_IP:$PORT

  Container        $CTID ($CT_HOSTNAME)
  Version          $REF
  Update           pct exec $CTID -- $IAL_UPDATE_COMMAND
  Service status   pct exec $CTID -- systemctl status $IAL_SERVICE
  Logs             pct exec $CTID -- journalctl -u $IAL_SERVICE -f
  Shell            pct enter $CTID

The application has no authentication. Keep it on a trusted LAN or reach it through a VPN.

DONE
