#!/usr/bin/env bash
set -euo pipefail

bash "$(cd -- "$(dirname -- "$0")" && pwd)/update-change-state.sh" "$1" REVIEWED "${2:-}"
