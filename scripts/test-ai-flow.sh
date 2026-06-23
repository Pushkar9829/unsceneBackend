#!/usr/bin/env bash
# Run full AI upload + analyze + callback test from EC2 Linux.
#
# Usage (on EC2, from backend repo root):
#   chmod +x scripts/test-ai-flow.sh
#   ./scripts/test-ai-flow.sh
#
# With real OTP login:
#   API_BASE_URL=http://localhost:5000 TEST_PHONE=9876543210 TEST_OTP=123456 ./scripts/test-ai-flow.sh
#
# With existing JWT (skip OTP):
#   API_BASE_URL=https://api.unscene.in ACCESS_TOKEN=eyJ... ./scripts/test-ai-flow.sh
#
# Use local files instead of downloading:
#   VIDEO_PATH=/path/to/episode.mp4 PRODUCT_IMAGE_PATH=/path/to/product.jpg ./scripts/test-ai-flow.sh
#
# Only upload, skip AI trigger:
#   SKIP_AI_TRIGGER=true ./scripts/test-ai-flow.sh
#
# Skip simulated callback:
#   SIMULATE_CALLBACK=false ./scripts/test-ai-flow.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

export API_BASE_URL="${API_BASE_URL:-http://localhost:5000}"
export SIMULATE_CALLBACK="${SIMULATE_CALLBACK:-true}"
export SKIP_AI_TRIGGER="${SKIP_AI_TRIGGER:-false}"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required. Install Node.js 18+ on EC2."
  exit 1
fi

NODE_MAJOR="$(node -e "console.log(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Node.js 18+ required (found $(node -v))"
  exit 1
fi

echo "=============================================="
echo " UnsceneAI — AI flow test"
echo " API: $API_BASE_URL"
echo " Repo: $BACKEND_DIR"
echo "=============================================="

node src/scripts/testAiFlow.js "$@"

echo ""
echo "Tip: tail backend logs while running:"
echo "  pm2 logs   # or: journalctl -u your-service -f"
echo "Look for: [ai-ingest] AI OUTBOUND REQUEST / AI CALLBACK RECEIVED"
