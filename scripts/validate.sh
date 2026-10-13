#!/usr/bin/env bash
# ZenJooo · Host checks. Rust failures remain failures when cargo is available.
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
node scripts/test-glass-ui.cjs
node scripts/test-webui-dom.cjs
node scripts/test-glass-performance.cjs
python3 scripts/generate-profiles.py --check
node scripts/check-profiles.cjs
python3 scripts/test-installer.py
python3 scripts/test-webui-updater.py
if command -v cargo >/dev/null 2>&1; then
  cargo test --manifest-path native/Cargo.toml --locked --offline
else
  echo "NOT RUN: Rust tests (cargo is missing). Android build requires Rust and NDK." >&2
fi
