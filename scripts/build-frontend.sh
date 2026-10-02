#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

(cd frontend && npm ci && npm run build)

rm -rf backend/static
cp -r frontend/out backend/static
touch backend/static/.gitkeep
