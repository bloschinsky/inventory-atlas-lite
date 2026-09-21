#!/usr/bin/env bash
# Updates an existing Inventory Atlas Lite installation without touching its data.
# Installed inside the container as /usr/local/sbin/inventory-atlas-lite-update.
set -Eeuo pipefail

usage() {
  cat <<'TXT'
Usage: inventory-atlas-lite-update [--version TAG|latest] [--branch NAME] [--help]

Updates the application code in /opt/inventory-atlas-lite/app to the requested release.
Defaults to the latest stable tagged release.

Before the update it stores a consistent SQLite backup in
/var/lib/inventory-atlas-lite/backups. The data directory and
/etc/inventory-atlas-lite.env are never replaced. If the new version fails its
health check, the previous code is restored and restarted automatically.

Environment variables APP_VERSION and APP_BRANCH work like the matching options.
TXT
}

APP_VERSION=${APP_VERSION:-latest}
APP_BRANCH=${APP_BRANCH:-}
while [ $# -gt 0 ]; do
  case $1 in
    --help|-h) usage; exit 0 ;;
    --version) APP_VERSION=${2:-}; shift 2 ;;
    --branch) APP_BRANCH=${2:-}; shift 2 ;;
    *) usage >&2; exit 2 ;;
  esac
done

IAL_LIB=${IAL_LIB:-/opt/inventory-atlas-lite/lib.sh}
if [ -f "$IAL_LIB" ]; then
  # shellcheck source=scripts/lib.sh
  . "$IAL_LIB"
else
  echo "[x] $IAL_LIB is missing. Is Inventory Atlas Lite installed here?" >&2
  exit 1
fi

ial_require_root
[ -d "$IAL_APP_DIR" ] || ial_die "No installation found in $IAL_APP_DIR."
[ -f "$IAL_ENV_FILE" ] || ial_die "No environment file found at $IAL_ENV_FILE."

if [ -n "$APP_BRANCH" ]; then
  ial_check "branch" "$APP_BRANCH" ial_valid_branch
  REF_KIND=branch
  REF=$APP_BRANCH
else
  ial_check "version" "$APP_VERSION" ial_valid_version
  REF_KIND=tag
  REF=$APP_VERSION
fi

PORT=$(grep -E '^PORT=' "$IAL_ENV_FILE" | tail -n 1 | cut -d= -f2)
PORT=${PORT:-3000}
ial_check "port in $IAL_ENV_FILE" "$PORT" ial_valid_port
HEALTH_URL="http://127.0.0.1:$PORT/api/health"

WORK=''
STAGING=''
cleanup() {
  if [ -n "$WORK" ] && [ -d "$WORK" ]; then rm -rf "$WORK"; fi
  if [ -n "$STAGING" ] && [ -d "$STAGING" ]; then rm -rf "$STAGING"; fi
}
trap cleanup EXIT
trap 'ial_warn "Update failed at line $LINENO."' ERR

# The application's backup endpoint uses SQLite's online backup API, so it stays consistent
# while the service keeps writing in WAL mode.
backup_database() {
  local target
  target="$IAL_BACKUP_DIR/inventory-$(date +%Y%m%d-%H%M%S).sqlite"
  install -d -o "$IAL_USER" -g "$IAL_USER" -m 0750 "$IAL_BACKUP_DIR"
  if ! curl -fsS --max-time 300 -o "$target" "http://127.0.0.1:$PORT/api/backup"; then
    rm -f "$target"
    ial_die "Could not create a pre-update backup. The installation was not changed."
  fi
  chown "$IAL_USER":"$IAL_USER" "$target"
  chmod 0640 "$target"
  BACKUP_PATH=$target
  ial_log "Pre-update backup written to $BACKUP_PATH"
  # Older backups beyond the retention count are removed; nothing else in the data directory is touched.
  # The backup names are generated above, so sorting the listing by time is safe here.
  # shellcheck disable=SC2012
  ls -1t "$IAL_BACKUP_DIR"/inventory-*.sqlite 2>/dev/null | tail -n +$((IAL_KEEP_BACKUPS + 1)) | while read -r old; do
    ial_log "Removing old backup $(basename "$old")"
    rm -f "$old"
  done
}

WORK=$(mktemp -d)
if [ "$REF_KIND" = tag ] && [ "$REF" = latest ]; then
  REF=$(ial_latest_tag)
  ial_log "Latest release resolved to $REF"
fi

# Everything below the swap happens in staging first, so a bad release never reaches the live code.
SOURCE=$(ial_fetch_source "$REF_KIND" "$REF" "$WORK")
# This updater runs from the installed lib.sh, so until now a release could not fix the update
# steps that install it. The downloaded release provides them from here on.
# shellcheck source=scripts/lib.sh
. "$SOURCE/scripts/lib.sh"
CURRENT_VERSION=$(ial_app_version "$IAL_APP_DIR")
NEW_VERSION=$(ial_app_version "$SOURCE")
ial_log "Updating Inventory Atlas Lite $CURRENT_VERSION to $NEW_VERSION ($REF)"
ial_build_app "$SOURCE"

STAGING=$(mktemp -d "$IAL_APP_ROOT/.staging.XXXXXX")
cp -a "$SOURCE/." "$STAGING/"
chown -R root:root "$STAGING"
chmod -R u=rwX,go=rX "$STAGING"

backup_database

ial_log "Stopping $IAL_SERVICE for the code swap"
systemctl stop "$IAL_SERVICE"
ial_install_code "$STAGING"
STAGING=''
install -m 0644 "$IAL_APP_DIR/deploy/$IAL_SERVICE.service" "/etc/systemd/system/$IAL_SERVICE.service"
install -m 0755 "$IAL_APP_DIR/scripts/lib.sh" "$IAL_APP_ROOT/lib.sh"
install -m 0750 "$IAL_APP_DIR/scripts/update.sh" "$IAL_UPDATE_COMMAND"
systemctl daemon-reload
systemctl start "$IAL_SERVICE"

if ! ial_wait_for_health "$HEALTH_URL" 120 "$NEW_VERSION"; then
  ial_warn "Version $NEW_VERSION failed its health check. Restoring $CURRENT_VERSION."
  systemctl stop "$IAL_SERVICE" || true
  if ial_rollback_code; then
    install -m 0644 "$IAL_APP_DIR/deploy/$IAL_SERVICE.service" "/etc/systemd/system/$IAL_SERVICE.service"
    systemctl daemon-reload
    systemctl start "$IAL_SERVICE"
    ial_wait_for_health "$HEALTH_URL" 120 \
      && ial_die "Update to $NEW_VERSION failed; $CURRENT_VERSION was restored. Backup: $BACKUP_PATH"
    ial_die "Update to $NEW_VERSION failed and the restored code is not healthy. Backup: $BACKUP_PATH"
  fi
  ial_die "Update to $NEW_VERSION failed and no previous code was available. Backup: $BACKUP_PATH"
fi

ial_log "Inventory Atlas Lite $(ial_app_version "$IAL_APP_DIR") is running and healthy."
ial_log "Pre-update backup: $BACKUP_PATH"
