#!/usr/bin/env bash

# Canonical, fail-closed production release entry point.
# The source checkout is never reset or built in place. A release is prepared
# from the exact origin/main commit in an isolated git worktree, then activated
# only after schema preflights, migrations, postflights and PM2 readiness pass.

set -Eeuo pipefail
IFS=$'\n\t'
umask 027

log() { printf '[deploy] %s\n' "$*"; }
die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }
require_command() { command -v "$1" >/dev/null 2>&1 || die "required command is unavailable: $1"; }
require_value() { [ -n "${!1:-}" ] || die "$1 is required"; }

for command_name in git node corepack pm2 curl flock stat date find readlink id ln mv chmod env; do
  require_command "$command_name"
done

require_value SARI_RELEASE_SHA
require_value SARI_RELEASE_ROOT
require_value SARI_ENV_FILE
require_value SARI_BUILD_ENV_FILE
require_value SARI_BACKUP_ID
require_value SARI_BACKUP_VERIFIED_AT
require_value SARI_DEPLOY_CONFIRM
require_value SARI_SCHEMA_CONFIRM
require_value DATABASE_URL

case "$SARI_RELEASE_SHA" in
  *[!0-9a-f]*|'') die 'SARI_RELEASE_SHA must be a full lowercase Git SHA' ;;
esac
[ "${#SARI_RELEASE_SHA}" -eq 40 ] || die 'SARI_RELEASE_SHA must contain exactly 40 characters'
[ "$SARI_DEPLOY_CONFIRM" = "deploy-sary-production:$SARI_RELEASE_SHA" ] \
  || die 'SARI_DEPLOY_CONFIRM does not match the requested release'
[ "$SARI_SCHEMA_CONFIRM" = "migrate-sary-production:$SARI_RELEASE_SHA" ] \
  || die 'SARI_SCHEMA_CONFIRM does not match the requested release'
[ "${SARI_PUBLIC_ORIGIN:-}" = 'https://sary.live' ] \
  || die 'SARI_PUBLIC_ORIGIN must be exactly https://sary.live'
[ "$(id -u)" -ne 0 ] || die 'production deployment must not run as root'
case "$SARI_BACKUP_ID" in
  *[!A-Za-z0-9._:-]*|'') die 'SARI_BACKUP_ID contains unsupported characters' ;;
esac
[ "${#SARI_BACKUP_ID}" -le 128 ] || die 'SARI_BACKUP_ID is too long'
case "$SARI_RELEASE_ROOT" in /*) ;; *) die 'SARI_RELEASE_ROOT must be absolute' ;; esac
case "$SARI_ENV_FILE" in /*) ;; *) die 'SARI_ENV_FILE must be absolute' ;; esac
case "$SARI_BUILD_ENV_FILE" in /*) ;; *) die 'SARI_BUILD_ENV_FILE must be absolute' ;; esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source_candidate="${SARI_SOURCE_DIR:-$script_dir/..}"
source_dir="$(cd "$source_candidate" && pwd -P)" || die 'SARI_SOURCE_DIR is unavailable'
release_root="$(mkdir -p "$SARI_RELEASE_ROOT" && cd "$SARI_RELEASE_ROOT" && pwd -P)"
env_file="$(readlink -f "$SARI_ENV_FILE")" || die 'SARI_ENV_FILE cannot be resolved'
build_env_file="$(readlink -f "$SARI_BUILD_ENV_FILE")" || die 'SARI_BUILD_ENV_FILE cannot be resolved'

case "$release_root" in
  /|/bin|/boot|/dev|/etc|/home|/opt|/root|/srv|/usr|/var) die 'SARI_RELEASE_ROOT is too broad' ;;
esac
[ -d "$source_dir/.git" ] || die 'SARI_SOURCE_DIR must be a Git checkout'
[ -r "$env_file" ] || die 'SARI_ENV_FILE must be a readable file'
[ -r "$build_env_file" ] || die 'SARI_BUILD_ENV_FILE must be a readable file'
[ -z "$(find "$env_file" -perm /007 -print -quit)" ] || die 'SARI_ENV_FILE must not be accessible to other users'

while IFS= read -r build_env_line || [ -n "$build_env_line" ]; do
  trimmed_line="${build_env_line#"${build_env_line%%[![:space:]]*}"}"
  case "$trimmed_line" in ''|'#'*) continue ;; esac
  build_env_key="${trimmed_line%%=*}"
  [ "$build_env_key" != "$trimmed_line" ] || die 'SARI_BUILD_ENV_FILE contains a malformed line'
  [[ "$build_env_key" =~ ^VITE_[A-Z0-9_]+$ ]] \
    || die 'SARI_BUILD_ENV_FILE may contain only explicit VITE_ public variables'
done <"$build_env_file"

backup_epoch="$(date -d "$SARI_BACKUP_VERIFIED_AT" +%s 2>/dev/null)" \
  || die 'SARI_BACKUP_VERIFIED_AT must be an ISO-8601 timestamp'
now_epoch="$(date +%s)"
backup_age="$((now_epoch - backup_epoch))"
[ "$backup_age" -ge 0 ] && [ "$backup_age" -le 3600 ] \
  || die 'the verified backup must be no more than 60 minutes old'

exec 9>"$release_root/.deploy.lock"
flock -n 9 || die 'another production deployment is already running'

log 'fetching origin/main without changing the source checkout'
git -C "$source_dir" fetch --prune origin main
remote_sha="$(git -C "$source_dir" rev-parse origin/main)"
[ "$remote_sha" = "$SARI_RELEASE_SHA" ] || die 'requested SHA is not the current origin/main commit'

release_dir="$release_root/releases/$SARI_RELEASE_SHA"
mkdir -p "$release_root/releases"
[ ! -L "$release_dir" ] || die 'release directory must not be a symlink'
if [ ! -d "$release_dir" ]; then
  git -C "$source_dir" worktree add --detach "$release_dir" "$SARI_RELEASE_SHA"
fi
[ "$(git -C "$release_dir" rev-parse HEAD)" = "$SARI_RELEASE_SHA" ] || die 'release worktree SHA mismatch'
[ -z "$(git -C "$release_dir" status --porcelain --untracked-files=no)" ] || die 'release worktree has tracked changes'

point_release_env() {
  target="$1"
  phase="$2"
  if [ -e "$release_dir/.env" ] && [ ! -L "$release_dir/.env" ]; then
    die 'release .env exists but is not a symlink'
  fi
  temporary_env_link="$release_dir/.env-$phase-$$"
  [ ! -e "$temporary_env_link" ] || die 'temporary environment link already exists'
  ln -s "$target" "$temporary_env_link"
  mv -Tf "$temporary_env_link" "$release_dir/.env"
  [ "$(readlink -f "$release_dir/.env")" = "$target" ] || die 'release environment link mismatch'
}

point_release_env "$build_env_file" build
cd "$release_dir"

log 'installing immutable dependencies and running release gates'
env -u DATABASE_URL -u RUN_MYSQL_INTEGRATION SARI_ENV_FILE="$build_env_file" NODE_ENV=test \
  corepack pnpm install --frozen-lockfile
env -u DATABASE_URL -u RUN_MYSQL_INTEGRATION SARI_ENV_FILE="$build_env_file" NODE_ENV=test \
  corepack pnpm audit:production
env -u DATABASE_URL -u RUN_MYSQL_INTEGRATION SARI_ENV_FILE="$build_env_file" NODE_ENV=test \
  corepack pnpm check
env -u DATABASE_URL -u RUN_MYSQL_INTEGRATION SARI_ENV_FILE="$build_env_file" NODE_ENV=test \
  corepack pnpm test:release
env -u RUN_MYSQL_INTEGRATION DATABASE_URL='mysql://schema_check:schema_check@127.0.0.1:3306/schema_check' \
  SARI_ENV_FILE="$build_env_file" NODE_ENV=test corepack pnpm db:check
env -u DATABASE_URL -u RUN_MYSQL_INTEGRATION SARI_ENV_FILE="$build_env_file" NODE_ENV=production \
  corepack pnpm build

point_release_env "$env_file" runtime
export SARI_ENV_FILE="$env_file"
export NODE_ENV=production

run_pre_migration_checks() {
  corepack pnpm preflight:zid-product-identity
  corepack pnpm preflight:zid-order-identity
  corepack pnpm preflight:whatsapp-active-phone
  corepack pnpm preflight:whatsapp-active-primary
  corepack pnpm preflight:tap-payment-identity
  corepack pnpm preflight:order-payment-link-identity
  corepack pnpm preflight:tap-order-effects
  corepack pnpm preflight:campaign-consent:before
  corepack pnpm preflight:campaign-outbox:before
  corepack pnpm preflight:occasion-campaigns:before
  corepack pnpm preflight:order-notification-ops:before
  corepack pnpm preflight:ai-settings-singleton:before
}

run_post_migration_checks() {
  corepack pnpm preflight:whatsapp-active-phone
  corepack pnpm preflight:whatsapp-active-primary
  corepack pnpm preflight:tap-payment-identity
  corepack pnpm preflight:order-payment-link-identity
  corepack pnpm preflight:tap-order-effects
  corepack pnpm preflight:salla-webhook-identity
  corepack pnpm preflight:calendly-webhook-identity
  corepack pnpm preflight:woocommerce-secure-sync
  corepack pnpm preflight:woocommerce-webhook-ingress
  corepack pnpm preflight:campaign-consent:after
  corepack pnpm preflight:campaign-outbox:after
  corepack pnpm preflight:occasion-campaigns:after
  corepack pnpm preflight:order-notification-ops:after
  corepack pnpm preflight:ai-settings-singleton:after
}

log "running count-only preflights against backup $SARI_BACKUP_ID"
run_pre_migration_checks
corepack pnpm db:migrate
run_post_migration_checks

previous_release=''
current_link="$release_root/current"
if [ -e "$current_link" ] && [ ! -L "$current_link" ]; then
  die 'current release pointer exists but is not a symlink'
fi
if [ -L "$current_link" ]; then
  previous_release="$(readlink -f "$current_link")"
fi

next_link="$release_root/.current-$SARI_RELEASE_SHA-$$"
[ ! -e "$next_link" ] || die 'temporary current link already exists'
ln -s "$release_dir" "$next_link"

cat >"$release_dir/.sari-release" <<EOF
release_sha=$SARI_RELEASE_SHA
backup_id=$SARI_BACKUP_ID
prepared_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
chmod 640 "$release_dir/.sari-release"

activation_attempted=0
rollback_activation() {
  status=$?
  if [ "$activation_attempted" -eq 1 ] && [ -n "$previous_release" ] \
    && [ -f "$previous_release/ecosystem.config.cjs" ]; then
    log 'activation failed; reloading the previous application release'
    SARI_ENV_FILE="$env_file" pm2 startOrReload "$previous_release/ecosystem.config.cjs" --only sari --update-env || true
  fi
  exit "$status"
}
trap rollback_activation ERR

log 'activating the prepared release through PM2 readiness'
activation_attempted=1
SARI_ENV_FILE="$env_file" pm2 startOrReload "$release_dir/ecosystem.config.cjs" --only sari --update-env

ready_json="$(curl --fail --silent --show-error --max-time 10 "$SARI_PUBLIC_ORIGIN/ready")"
node -e '
  const body = JSON.parse(process.argv[1]);
  if (body?.status !== "ready" || body?.checks?.database !== "connected" || body?.checks?.schema !== "current") process.exit(1);
' "$ready_json"

mv -Tf "$next_link" "$current_link"
trap - ERR
activation_attempted=0
log "release activated successfully: $SARI_RELEASE_SHA"
