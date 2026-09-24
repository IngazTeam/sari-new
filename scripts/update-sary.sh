#!/usr/bin/env bash
# Established droplet profile: root orchestrates; sari-deploy owns PM2 on port 3000.
# Invoke after a fast-forward pull of main, as documented in PRODUCTION_RELEASE_RUNBOOK.md.
set +x
set -Eeuo pipefail
umask 027
ulimit -c 0

die() { printf '[update] %s\n' "$*" >&2; exit 1; }
phase=PREPARATION
activation_attempted=0
previous_release=''
source_dir=/var/www/sari
runtime_dir=/home/sari-deploy/.local/sari-runtime
runtime_path="$runtime_dir/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
node_bin="$runtime_dir/node_modules/node/bin/node"
pm2_bin="$runtime_dir/node_modules/pm2/bin/pm2"
ops="$source_dir/scripts/sary-update-ops.mjs"

pm() {
  runuser -u sari-deploy -- env -i HOME=/home/sari-deploy PATH="$runtime_path" \
    PM2_HOME=/home/sari-deploy/.pm2 NODE_ENV=production SARI_ENV_FILE=/var/www/.env \
    PORT=3000 SARI_WEB_CONCURRENCY=1 "$node_bin" "$pm2_bin" "$@" 9>&-
}
matches() { pm jlist | "$node_bin" "$ops" pm2-match "$1"; }
activate() {
  local target="$1"
  pm startOrReload "$target/ecosystem.config.cjs" --only sari,sari-inbound \
    --interpreter "$node_bin" --update-env || return 1
  if matches "$target"; then return 0; fi
  pm delete sari || return 1
  pm delete sari-inbound || return 1
  pm start "$target/ecosystem.config.cjs" --only sari,sari-inbound \
    --interpreter "$node_bin" --update-env || return 1
  matches "$target"
}
failed() {
  local result="$1"
  trap - ERR
  set +e
  printf '\nUPDATE_STOPPED\nPHASE=%s\nEXIT_CODE=%s\n' "$phase" "$result"
  if [ "$activation_attempted" -eq 1 ] && [ -n "$previous_release" ]; then
    if activate "$previous_release" && "$node_bin" "$ops" ready && pm save; then
      echo 'PREVIOUS_APPLICATION_RESTORED; DATABASE_MIGRATIONS_RETAINED'
    else
      echo 'APPLICATION_REQUIRES_ATTENTION'
    fi
  elif [ "$phase" = PUBLIC_CHECK ]; then
    echo 'NEW_RELEASE_RUNNING_LOCALLY; PUBLIC_ROUTE_REQUIRES_ATTENTION'
  fi
  exit "$result"
}
trap 'failed "$?"' ERR
trap 'failed 130' INT
trap 'failed 143' TERM

[ "$(id -u)" -eq 0 ] || die RUN_AS_ROOT
for tool in git corepack runuser flock mktemp install stat find openssl gzip sha256sum mysqldump; do
  command -v "$tool" >/dev/null || die "MISSING_TOOL=$tool"
done
test -x "$node_bin"
test -r "$pm2_bin"
[ "$("$node_bin" --version)" = v22.23.2 ] || die NODE_22_23_2_REQUIRED
runuser -u sari-deploy -- test -r /var/www/.env
[ -z "$(find -L /var/www/.env -perm /007 -print -quit)" ] || die RUNTIME_ENV_IS_WORLD_ACCESSIBLE
exec 9>/var/lock/sari-activation.lock
flock -n 9 || die ANOTHER_UPDATE_IS_RUNNING

cd "$source_dir"
[ "$(git branch --show-current)" = main ] || die MAIN_BRANCH_REQUIRED
git diff --quiet HEAD -- || die SOURCE_HAS_UNCOMMITTED_CHANGES
git fetch origin main
release_sha="$(git rev-parse HEAD)"
[ "$release_sha" = "$(git rev-parse origin/main)" ] || die MAIN_CHANGED_RUN_UPDATE_COMMAND_AGAIN
previous_release="$(pm jlist | "$node_bin" "$ops" pm2-current)"
test -f "$previous_release/ecosystem.config.cjs"
previous_sha="$(git -c safe.directory="$previous_release" -C "$previous_release" rev-parse HEAD)"
git merge-base --is-ancestor "$previous_sha" "$release_sha" || die REFUSING_APPLICATION_DOWNGRADE

phase=PREPARE_RELEASE
release_dir="$(mktemp -d "/var/www/sari-release-${release_sha:0:8}-XXXXXX")"
git worktree add --detach "$release_dir" "$release_sha"
cd "$release_dir"
ops="$release_dir/scripts/sary-update-ops.mjs"

build_task() {
  local environment="$1"
  shift
  env -i HOME=/root PATH="$runtime_path" CI=true NODE_ENV="$environment" \
    SARI_ENV_FILE=/dev/null NODE_OPTIONS=--max-old-space-size=4096 \
    corepack pnpm@10.4.1 "$@"
}
phase=INSTALL_AND_BUILD
build_task test install --frozen-lockfile
env -i HOME=/root PATH="$runtime_path" NODE_ENV=test SARI_ENV_FILE=/dev/null \
  "$node_bin" --test scripts/sary-update-ops.test.mjs
build_task test check
build_task production build
test -s dist/index.js
test -s dist/worker.js
test -s dist/public/index.html

# A unique static marker verifies that the public proxy reaches this actual release.
release_token="$("$node_bin" -e 'process.stdout.write(require("node:crypto").randomBytes(16).toString("hex"))')"
mkdir -p dist/public/_deploy
printf '{"sha":"%s","token":"%s"}\n' "$release_sha" "$release_token" > "dist/public/_deploy/$release_token.json"
chgrp -R sari-deploy "$release_dir"
chmod -R g+rX "$release_dir"
install -d -o sari-deploy -g sari-deploy -m 750 "$release_dir/logs"

phase=ENCRYPTED_BACKUP
env -i HOME=/root PATH="$runtime_path" SARI_BACKUP_SOURCE="$release_dir" \
  bash "$release_dir/scripts/backup-sary.sh"

phase=MIGRATIONS_AND_CHECKS
runuser -u sari-deploy -- env -i HOME=/home/sari-deploy PATH="$runtime_path" \
  NODE_ENV=production SARI_ENV_FILE=/var/www/.env SARI_DB_POOL_SIZE=2 \
  "$node_bin" --import tsx "$ops" migrate

phase=ACTIVATE
activation_attempted=1
activate "$release_dir"
"$node_bin" "$ops" ready
matches "$release_dir"
pm save
printf 'release_sha=%s\nprevious_release=%s\nactivated_at=%s\n' \
  "$release_sha" "$previous_release" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > .sari-release
activation_attempted=0

phase=PUBLIC_CHECK
"$node_bin" "$ops" public "$release_sha" "$release_token"
printf '\nDEPLOY_OK\nCOMMIT=%s\nRELEASE_DIR=%s\nPUBLIC_SITE=https://sary.live\n' "$release_sha" "$release_dir"
