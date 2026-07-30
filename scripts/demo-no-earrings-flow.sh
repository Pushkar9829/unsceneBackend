#!/usr/bin/env bash
# Create and analyze a series with everything except earrings:
# shirt (clothing), headphones, eyeglasses.
#
# EC2:
#   bash scripts/demo-no-earrings-flow.sh
#
# Explicit episode video:
#   DEMO_VIDEO=/home/ubuntu/unsceneBackend/demo-media/video.mp4 \
#     bash scripts/demo-no-earrings-flow.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

export API_BASE_URL="${API_BASE_URL:-https://api.unscene.in}"
export DEMO_MEDIA_DIR="${DEMO_MEDIA_DIR:-$BACKEND_DIR/demo-media}"
export DEMO_PURCHASE_LINK="${DEMO_PURCHASE_LINK:-https://purchase.link/demo}"
export DEMO_PRODUCT_MODE="no-earrings"
export DEMO_SERIES_NAME_PREFIX="${DEMO_SERIES_NAME_PREFIX:-Demo No-Earrings Series}"
export OUT_PATH="${OUT_PATH:-$BACKEND_DIR/docs/fixtures/DEMO_NO_EARRINGS_RESULT.json}"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required. Install Node.js 18+ on EC2."
  exit 1
fi

echo "=================================================="
echo " UnsceneAI — NO EARRINGS AI flow"
echo " Products: shirt, headphones, eyeglasses"
echo " Skipped:  earrings"
echo " Video:    ${DEMO_VIDEO:-$DEMO_MEDIA_DIR/video.mp4}"
echo "=================================================="

node src/scripts/demoNoEarringsFlow.js "$@"

echo ""
echo "Result JSON: $OUT_PATH"
