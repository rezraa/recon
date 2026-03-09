#!/usr/bin/env bash
set -euo pipefail

# Recon — one-command local dev startup
# Usage: ./run.sh        (start everything)
#        ./run.sh stop    (tear down)

DC="docker compose -f docker-compose.yml -f docker-compose.dev.yml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}▸${NC} $1"; }
warn()  { echo -e "${YELLOW}▸${NC} $1"; }
error() { echo -e "${RED}▸${NC} $1"; }

if [ "${1:-}" = "stop" ]; then
  info "Stopping services..."
  $DC down
  echo -e "${GREEN}Done.${NC}"
  exit 0
fi

# 1. Check prerequisites
for cmd in docker pnpm; do
  if ! command -v "$cmd" &>/dev/null; then
    error "$cmd is required but not installed."
    exit 1
  fi
done

# 2. Ensure .env exists with local dev defaults
if [ ! -f .env ]; then
  warn "No .env found — creating from .env.example with local dev defaults..."
  if [ -f .env.example ]; then
    sed \
      -e 's|postgresql://recon:recon@postgres:5432/recon|postgresql://recon:recon@localhost:5432/recon|' \
      -e 's|redis://redis:6379|redis://localhost:6379|' \
      .env.example > .env
    # Generate encryption key if empty
    if grep -q '^ENCRYPTION_KEY=$' .env; then
      KEY=$(openssl rand -hex 32)
      sed -i '' "s|^ENCRYPTION_KEY=$|ENCRYPTION_KEY=$KEY|" .env
      info "Generated ENCRYPTION_KEY"
    fi
  else
    cat > .env <<'EOF'
DATABASE_URL=postgresql://recon:recon@localhost:5432/recon
REDIS_URL=redis://localhost:6379
EOF
  fi
  info "Created .env with local dev settings"
fi

# 3. Start infrastructure (postgres + redis only, not the app container)
info "Starting Postgres & Redis..."
$DC up -d postgres redis

# 4. Wait for healthy services (uses Docker healthcheck defined in docker-compose.yml)
info "Waiting for databases to be ready..."
remaining=60
while [ $remaining -gt 0 ]; do
  pg_health=$($DC ps postgres --format '{{.Health}}' 2>/dev/null || echo "unknown")
  redis_health=$($DC ps redis --format '{{.Health}}' 2>/dev/null || echo "unknown")
  if [ "$pg_health" = "healthy" ] && [ "$redis_health" = "healthy" ]; then
    break
  fi
  printf "."
  sleep 2
  remaining=$((remaining - 2))
done
echo ""

if [ $remaining -le 0 ]; then
  error "Services failed to become healthy within 60s"
  $DC logs --tail=20 postgres redis
  exit 1
fi
info "Databases ready"

# 5. Install dependencies if needed
if [ ! -d node_modules ]; then
  info "Installing dependencies..."
  pnpm install
fi

# 6. Run migrations
info "Running database migrations..."
pnpm drizzle-kit push 2>/dev/null || pnpm drizzle-kit migrate 2>/dev/null || warn "Migration command not available — skipping"

# 7. Start worker + dev server
info "Starting BullMQ worker in background..."
pnpm worker:dev &
WORKER_PID=$!

cleanup() {
  info "Shutting down worker (PID $WORKER_PID)..."
  kill "$WORKER_PID" 2>/dev/null
  wait "$WORKER_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

info "Starting Next.js dev server..."
echo ""
echo -e "  ${GREEN}Recon is running at${NC}  →  http://localhost:3000"
echo -e "  ${GREEN}Worker PID${NC}           →  $WORKER_PID"
echo ""
pnpm dev
