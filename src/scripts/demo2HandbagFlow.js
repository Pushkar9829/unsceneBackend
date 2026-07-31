#!/usr/bin/env node
/**
 * Demo2 AI flow — Magnolia tote / handbag only (non-clothing)
 * using demoVideo2.mp4 from demo-media-2/.
 */
process.env.DEMO_CATALOG = "demo2";
process.env.DEMO_PRODUCT_MODE = "handbag";
process.env.DEMO_SERIES_NAME_PREFIX =
  process.env.DEMO_SERIES_NAME_PREFIX || "Demo2 Handbag Series";
process.env.OUT_PATH =
  process.env.OUT_PATH ||
  require("path").join(__dirname, "../../docs/fixtures/DEMO2_HANDBAG_RESULT.json");

require("./demoSeriesEpisodeFlow");
