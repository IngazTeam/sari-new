#!/usr/bin/env bash
set -Eeuo pipefail

# Compatibility wrapper. Force reset and destructive rollback modes were
# intentionally retired; all production releases use the canonical gate.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
exec bash "$script_dir/deploy-production.sh" "$@"
