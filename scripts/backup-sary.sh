#!/usr/bin/env bash
# Non-interactive encrypted snapshot for the established Sary droplet.
# Archive integrity is checked; no restore into any database is performed.
(
set +x
set -Eeuo pipefail
umask 077

[ "$(id -u)" -eq 0 ] || { echo 'RUN_AS_ROOT'; exit 1; }
[[ "${SARI_BACKUP_SOURCE:-}" =~ ^/var/www/sari-release-[A-Za-z0-9-]+$ ]] || { echo INVALID_BACKUP_SOURCE; exit 1; }
test ! -L "$SARI_BACKUP_SOURCE"
cd "$SARI_BACKUP_SOURCE"
test -r /var/www/.env
test -d node_modules/mysql2
for tool in node openssl gzip sha256sum mktemp install stat; do
  command -v "$tool" >/dev/null || { echo "MISSING_TOOL=$tool"; exit 1; }
done

SARI_DUMP_TOOL="$(command -v mysqldump || command -v mariadb-dump || true)"
[ -n "$SARI_DUMP_TOOL" ] || { echo 'MISSING_TOOL=mysqldump_or_mariadb-dump'; exit 1; }
export SARI_DUMP_TOOL
test -d /var/backups
SARI_BACKUP_DIR="$(mktemp -d /var/backups/sari-pre-migration-XXXXXXXX)"
SARI_BACKUP_TMP="$(mktemp -d /tmp/sari-backup-client-XXXXXXXX)"
export SARI_BACKUP_DIR SARI_BACKUP_TMP
# Prevent a saved root login path or MYSQL_PWD overriding the intended credentials.
export MYSQL_TEST_LOGIN_FILE="$SARI_BACKUP_TMP/unused-login.cnf"
unset MYSQL_PWD

cleanup() {
  result=$?
  trap - EXIT
  unset SARI_BACKUP_PASS SARI_BACKUP_CONFIRM
  rm -f -- "$SARI_BACKUP_TMP/client.cnf" "$SARI_BACKUP_TMP/database.name" \
    "$SARI_BACKUP_TMP/ca.pem" "$SARI_BACKUP_TMP/cert.pem" "$SARI_BACKUP_TMP/key.pem"
  rmdir -- "$SARI_BACKUP_TMP" || true
  if [ "$result" -ne 0 ]; then
    printf '\nBACKUP_INCOMPLETE\nDIRECTORY=%s\n' "$SARI_BACKUP_DIR"
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

node --input-type=module <<'NODE'
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import mysql from 'mysql2/promise';

let connection;
try {
  let databaseUrl = '';
  for (const line of fs.readFileSync('/var/www/.env', 'utf8').split('\n')) {
    const match = line.trim().match(/^DATABASE_URL\s*=(.*)$/);
    if (match && !databaseUrl) databaseUrl = match[1].trim();
  }
  const url = new URL(databaseUrl);
  if (!['mysql:', 'mysql2:'].includes(url.protocol)) throw new Error('INVALID_DATABASE_PROTOCOL');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/.test(database)) throw new Error('DATABASE_NAME_REQUIRES_REVIEW');
  if (['mysql', 'sys', 'performance_schema', 'information_schema'].includes(database.toLowerCase())) {
    throw new Error('SYSTEM_DATABASE_REFUSED');
  }
  const tmp = process.env.SARI_BACKUP_TMP;
  const out = process.env.SARI_BACKUP_DIR;
  const help = execFileSync(process.env.SARI_DUMP_TOOL, ['--no-defaults', '--help'], { encoding: 'utf8' });
  const clientVersion = execFileSync(process.env.SARI_DUMP_TOOL, ['--no-defaults', '--version'], { encoding: 'utf8' }).trim();
  const config = {
    host: url.hostname.replace(/^\[|\]$/g, ''), port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
    database, connectTimeout: 15000,
  };
  const quote = value => {
    if (/[\x00-\x1f\x7f]/.test(String(value))) throw new Error('UNSUPPORTED_CREDENTIAL_CONTROL_CHARACTER');
    return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  };
  const options = ['[client]', 'protocol=TCP', 'default-character-set=utf8mb4'];
  for (const key of ['host', 'port', 'user', 'password']) options.push(`${key}=${quote(config[key])}`);

  if (url.searchParams.has('ssl')) {
    const ssl = JSON.parse(url.searchParams.get('ssl'));
    if (!ssl || typeof ssl !== 'object' || Array.isArray(ssl) ||
      Object.keys(ssl).some(key => !['ca', 'cert', 'key', 'rejectUnauthorized'].includes(key))) {
      throw new Error('CUSTOM_TLS_CONFIG_REQUIRES_REVIEW');
    }
    config.ssl = ssl;
    const verify = ssl.rejectUnauthorized !== false;
    if (help.includes('--ssl-mode')) options.push(`ssl-mode=${verify ? 'VERIFY_IDENTITY' : 'REQUIRED'}`);
    else if (help.includes('--ssl-verify-server-cert')) {
      options.push('ssl', `ssl-verify-server-cert=${verify ? '1' : '0'}`);
    } else throw new Error('DUMP_CLIENT_TLS_UNSUPPORTED');
    for (const key of ['ca', 'cert', 'key']) {
      if (!ssl[key]) continue;
      const pem = Array.isArray(ssl[key]) ? ssl[key].join('\n') : ssl[key];
      if (typeof pem !== 'string') throw new Error('UNSUPPORTED_TLS_PEM');
      const file = `${tmp}/${key}.pem`;
      fs.writeFileSync(file, pem, { mode: 0o600, flag: 'wx' });
      options.push(`ssl-${key}=${quote(file)}`);
    }
  }

  connection = await mysql.createConnection(config);
  const [[server]] = await connection.query('SELECT VERSION() AS version, DATABASE() AS db');
  if (server.db !== database) throw new Error('DATABASE_IDENTITY_MISMATCH');
  const [tables] = await connection.execute(
    'SELECT TABLE_NAME, ENGINE, DATA_LENGTH, INDEX_LENGTH FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ?',
    [database, 'BASE TABLE'],
  );
  if (!tables.length) throw new Error('SOURCE_DATABASE_EMPTY');
  if (tables.some(table => String(table.ENGINE).toLowerCase() !== 'innodb')) {
    throw new Error('NON_INNODB_TABLES_REQUIRE_DIFFERENT_BACKUP');
  }
  const estimatedBytes = tables.reduce((sum, table) => sum + Number(table.DATA_LENGTH || 0) + Number(table.INDEX_LENGTH || 0), 0);
  const disk = fs.statfsSync(out);
  if (disk.bavail * disk.bsize < estimatedBytes * 2 + 256 * 1024 * 1024) {
    throw new Error('INSUFFICIENT_BACKUP_DISK_SPACE');
  }
  fs.writeFileSync(`${tmp}/client.cnf`, options.join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(`${tmp}/database.name`, database, { mode: 0o600, flag: 'wx' });
  fs.writeFileSync(`${out}/metadata.json`, JSON.stringify({
    preparedAt: new Date().toISOString(), database, serverVersion: server.version,
    clientVersion, opensslVersion: execFileSync('openssl', ['version'], { encoding: 'utf8' }).trim(),
    baseTableCount: tables.length, estimatedBytes,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    encryption: 'openssl aes-256-cbc, PBKDF2-SHA256, 200000 iterations; SQL gzip compressed',
    scope: 'One application database and its runtime env; excludes uploads, DB users/grants and other services',
    restoreVerified: false,
  }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(`SOURCE_SERVER=${server.version}`);
  console.log(`DUMP_CLIENT=${clientVersion}`);
  console.log(`SOURCE_TABLES=${tables.length}`);
  console.log(`DATABASE_LOCATION=${['localhost', '127.0.0.1', '::1'].includes(config.host) ? 'LOCAL' : 'REMOTE'}`);
} catch (error) {
  // Do not print connection strings, SQL rows, driver messages or credentials.
  const code = error?.code || (/^[A-Z0-9_]+$/.test(error?.message || '') ? error.message : 'BACKUP_PREFLIGHT_FAILED');
  console.error(`BACKUP_PREFLIGHT_ERROR=${code}`);
  process.exitCode = 1;
} finally {
  if (connection) await connection.end().catch(() => {});
}
NODE

# Keep the recovery key separate from the encrypted archives and application secrets.
SARI_KEY_DIR=/var/lib/sari-backup
SARI_KEY_FILE="$SARI_KEY_DIR/archive.key"
if [ ! -e "$SARI_KEY_DIR" ]; then install -d -o root -g root -m 700 "$SARI_KEY_DIR"; fi
[ ! -L "$SARI_KEY_DIR" ] && [ -d "$SARI_KEY_DIR" ]
[ "$(stat -c '%u:%a' "$SARI_KEY_DIR")" = 0:700 ]
if [ ! -e "$SARI_KEY_FILE" ] && [ ! -L "$SARI_KEY_FILE" ]; then
  ( set -o noclobber; openssl rand -hex 32 > "$SARI_KEY_FILE" )
  chmod 600 "$SARI_KEY_FILE"
fi
[ ! -L "$SARI_KEY_FILE" ] && [ -f "$SARI_KEY_FILE" ]
[ "$(stat -c '%u:%a' "$SARI_KEY_FILE")" = 0:600 ]
IFS= read -r SARI_BACKUP_PASS < "$SARI_KEY_FILE"
[[ "$SARI_BACKUP_PASS" =~ ^[0-9a-f]{64}$ ]]

dump_options=(--single-transaction --quick --routines --triggers --events --hex-blob --no-tablespaces)
dump_help="$("$SARI_DUMP_TOOL" --no-defaults --help)"
[[ "$dump_help" != *--set-gtid-purged* ]] || dump_options+=(--set-gtid-purged=OFF)
[[ "$dump_help" != *--column-statistics* ]] || dump_options+=(--column-statistics=0)
SARI_DATABASE_NAME="$(cat "$SARI_BACKUP_TMP/database.name")"
date -u +%Y-%m-%dT%H:%M:%SZ > "$SARI_BACKUP_DIR/dump-started-at.txt"

echo 'BACKUP=RUNNING'
"$SARI_DUMP_TOOL" --defaults-file="$SARI_BACKUP_TMP/client.cnf" \
  "${dump_options[@]}" "$SARI_DATABASE_NAME" \
  | gzip -1 \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256 \
      -pass fd:3 3<<<"$SARI_BACKUP_PASS" -out "$SARI_BACKUP_DIR/database.sql.gz.enc.partial"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 \
  -pass fd:3 3<<<"$SARI_BACKUP_PASS" -in "$SARI_BACKUP_DIR/database.sql.gz.enc.partial" \
  | gzip -t
mv -- "$SARI_BACKUP_DIR/database.sql.gz.enc.partial" "$SARI_BACKUP_DIR/database.sql.gz.enc"

# FIELD_ENCRYPTION_KEY and other runtime secrets are necessary for disaster recovery.
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256 \
  -pass fd:3 3<<<"$SARI_BACKUP_PASS" -in /var/www/.env -out "$SARI_BACKUP_DIR/runtime.env.enc.partial"
env_hash="$(sha256sum /var/www/.env)"
decrypted_env_hash="$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 \
  -pass fd:3 3<<<"$SARI_BACKUP_PASS" -in "$SARI_BACKUP_DIR/runtime.env.enc.partial" | sha256sum)"
[ "${env_hash%% *}" = "${decrypted_env_hash%% *}" ] || { echo 'ENV_ARCHIVE_CHECK_FAILED'; exit 1; }
mv -- "$SARI_BACKUP_DIR/runtime.env.enc.partial" "$SARI_BACKUP_DIR/runtime.env.enc"
unset SARI_BACKUP_PASS env_hash decrypted_env_hash

cd "$SARI_BACKUP_DIR"
date -u +%Y-%m-%dT%H:%M:%SZ > archive-checked-at.txt
sha256sum database.sql.gz.enc runtime.env.enc metadata.json dump-started-at.txt archive-checked-at.txt > SHA256SUMS
sha256sum --check SHA256SUMS
printf '\nBACKUP_CREATED=%s\nARCHIVE_CHECK=PASSED\nRESTORE_VERIFIED=NO\nOFFSITE_COPY=REQUIRED\n' "$SARI_BACKUP_DIR"
printf 'BACKUP_KEY_FILE=/var/lib/sari-backup/archive.key\n'
)
