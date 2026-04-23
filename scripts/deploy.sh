#!/usr/bin/env bash
# Deploy PaperClone to HK production (shijuan.heydee.cc).
#
# Usage:
#   ./scripts/deploy.sh             # deploy frontend + backend (default)
#   ./scripts/deploy.sh frontend    # only rebuild + upload frontend
#   ./scripts/deploy.sh backend     # only pull + restart backend on HK
#   ./scripts/deploy.sh status      # just show current health
#
# Prereqs:
#   - SSH alias 'hk' configured in ~/.ssh/config
#   - Mac has Node + npm; project deps already installed
#   - Backend changes have been git-pushed to main (HK pulls from GitHub)

set -euo pipefail

GREEN=$'\e[0;32m'; YELLOW=$'\e[0;33m'; RED=$'\e[0;31m'; BOLD=$'\e[1m'; NC=$'\e[0m'
info()  { printf "%s▶%s %s\n" "$GREEN" "$NC" "$*"; }
warn()  { printf "%s!%s %s\n" "$YELLOW" "$NC" "$*"; }
die()   { printf "%s✗%s %s\n" "$RED" "$NC" "$*" >&2; exit 1; }

cd "$(cd "$(dirname "$0")/.." && pwd)"

MODE="${1:-all}"
HK_SSH="hk"
HK_DOMAIN="shijuan.heydee.cc"
HK_STATIC_DIR="/var/www/paperclone"
HK_REPO_DIR="/root/PaperClone"
API_BASE="https://${HK_DOMAIN}"

deploy_frontend() {
  info "Frontend ▸ build (NEXT_PUBLIC_API_BASE=${API_BASE})"
  ( cd frontend && NEXT_PUBLIC_API_BASE="$API_BASE" npm run build )

  info "Frontend ▸ rsync to ${HK_SSH}:${HK_STATIC_DIR}/"
  rsync -az --delete frontend/out/ "${HK_SSH}:${HK_STATIC_DIR}/"

  info "Frontend ▸ reload nginx"
  ssh "$HK_SSH" 'nginx -t && systemctl reload nginx'

  info "Frontend ▸ health"
  curl -fsS -o /dev/null -w "  HTTP %{http_code}  ${API_BASE}/\n" "$API_BASE/" \
    || die "Frontend not reachable"
}

deploy_backend() {
  info "Backend ▸ git pull on ${HK_SSH}"
  ssh "$HK_SSH" "cd $HK_REPO_DIR && git pull --ff-only"

  info "Backend ▸ ensure libreoffice (needed for legacy .doc parsing)"
  ssh "$HK_SSH" 'command -v soffice >/dev/null 2>&1 || command -v libreoffice >/dev/null 2>&1 || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libreoffice-writer; }'

  info "Backend ▸ pip install (in case requirements changed)"
  ssh "$HK_SSH" "cd $HK_REPO_DIR/backend && .venv/bin/pip install -q -r requirements.txt"

  info "Backend ▸ restart paperclone-api.service"
  ssh "$HK_SSH" 'systemctl restart paperclone-api.service'
  ssh "$HK_SSH" 'systemctl is-active paperclone-api.service' >/dev/null \
    || die "paperclone-api.service is not active after restart"

  info "Backend ▸ health"
  ssh "$HK_SSH" 'curl -fsS http://127.0.0.1:8000/api/paper-types | head -c 80; echo' \
    || die "Backend health check failed"
}

show_status() {
  info "Service status on HK"
  ssh "$HK_SSH" 'systemctl status paperclone-api.service --no-pager | head -5; echo; systemctl status nginx --no-pager | head -3'
  info "Public health"
  curl -fsS -o /dev/null -w "  Frontend: HTTP %{http_code}  ${API_BASE}/\n" "$API_BASE/" || true
  curl -fsS "$API_BASE/api/paper-types" -o /dev/null -w "  API:      HTTP %{http_code}\n" || true
}

# --- main ---
if ! git diff --quiet || ! git diff --cached --quiet; then
  warn "Working tree has uncommitted changes."
  warn "  Frontend will deploy your local edits (build uses working tree)."
  warn "  Backend pulls from GitHub — uncommitted backend changes won't ship."
fi

case "$MODE" in
  all)
    deploy_frontend
    deploy_backend
    ;;
  frontend|fe|f)
    deploy_frontend
    ;;
  backend|be|b)
    deploy_backend
    ;;
  status|s)
    show_status
    exit 0
    ;;
  *)
    die "Usage: $0 [all|frontend|backend|status]"
    ;;
esac

info "Done — ${BOLD}${API_BASE}${NC}"
