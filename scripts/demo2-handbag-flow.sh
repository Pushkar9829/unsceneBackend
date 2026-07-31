#!/usr/bin/env bash
# Demo2 handbag-only AI flow — Magnolia tote bag + demoVideo2.mp4
#
# EC2:
#   bash scripts/demo2-handbag-flow.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

export API_BASE_URL="${API_BASE_URL:-https://api.unscene.in}"
export DEMO_CATALOG="demo2"
export DEMO_PRODUCT_MODE="handbag"
export DEMO_MEDIA_DIR="${DEMO_MEDIA_DIR:-$BACKEND_DIR/demo-media-2}"
export DEMO_VIDEO_FILE="${DEMO_VIDEO_FILE:-demoVideo2.mp4}"
export DEMO_PURCHASE_LINK="${DEMO_PURCHASE_LINK:-https://purchase.link/demo}"
export DEMO_SERIES_NAME_PREFIX="${DEMO_SERIES_NAME_PREFIX:-Demo2 Handbag Series}"
export OUT_PATH="${OUT_PATH:-$BACKEND_DIR/docs/fixtures/DEMO2_HANDBAG_RESULT.json}"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required. Install Node.js 18+ on EC2."
  exit 1
fi

echo "=================================================="
echo " UnsceneAI — DEMO2 HANDBAG only AI flow"
echo " Video:    $DEMO_MEDIA_DIR/$DEMO_VIDEO_FILE"
echo " Product:  Magnolia Canvas Tote Bag (non-clothing)"
echo " Skipped:  top, earrings"
echo "=================================================="

node src/scripts/demo2HandbagFlow.js "$@"

echo ""
echo "Result JSON: $OUT_PATH"
