#!/usr/bin/env bash
# Launch the FastAPI dev server with weasyprint's native deps resolvable.
# On macOS, Python doesn't honor DYLD_FALLBACK_LIBRARY_PATH inherited from
# System SIP-protected binaries, so we must set it in the shell before
# executing python/uvicorn.

set -euo pipefail
cd "$(dirname "$0")"

# Apple Silicon default; fall back to Intel homebrew path if present.
if [[ -d /opt/homebrew/lib ]]; then
  export DYLD_FALLBACK_LIBRARY_PATH="/opt/homebrew/lib:${DYLD_FALLBACK_LIBRARY_PATH:-}"
elif [[ -d /usr/local/lib ]]; then
  export DYLD_FALLBACK_LIBRARY_PATH="/usr/local/lib:${DYLD_FALLBACK_LIBRARY_PATH:-}"
fi

exec .venv/bin/uvicorn app.main:app --reload --port 8000 "$@"
