#!/usr/bin/env bash
# Demo series/episode AI flow (clothing + non-clothing) — run from EC2 Linux.
#
# Default (creates a new series, uploads demo-media, waits for the AI callback):
#   bash scripts/demo-series-flow.sh
#
# Against a local API on the same box:
#   API_BASE_URL=http://127.0.0.1:5000 bash scripts/demo-series-flow.sh
#
# Use your own episode video (local path or https URL):
#   DEMO_VIDEO=/home/ubuntu/video.mp4 bash scripts/demo-series-flow.sh
#
# Re-trigger the AI model for an existing series and poll again:
#   SERIES_ID=6a6ba496b0118319e3a1b768 bash scripts/demo-series-flow.sh
#
# Skip the model and write cues from a sample detection callback:
#   SIMULATE_CALLBACK=true bash scripts/demo-series-flow.sh
#
# Upload only, no AI call:
#   SKIP_AI_TRIGGER=true bash scripts/demo-series-flow.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

export API_BASE_URL="${API_BASE_URL:-https://api.unscene.in}"
export DEMO_MEDIA_DIR="${DEMO_MEDIA_DIR:-$BACKEND_DIR/demo-media}"
export DEMO_PURCHASE_LINK="${DEMO_PURCHASE_LINK:-https://purchase.link/demo}"

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
echo " UnsceneAI — demo series episode AI flow"
echo " API:   $API_BASE_URL"
echo " Media: $DEMO_MEDIA_DIR"
echo "=============================================="

node src/scripts/demoSeriesEpisodeFlow.js "$@"

echo ""
echo "Result JSON: docs/fixtures/DEMO_SERIES_EPISODE_RESULT.json"
echo "Tail backend logs to see the AI exchange:"
echo "  pm2 logs --lines 200 | grep -A20 'ai-ingest'"
