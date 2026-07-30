#!/usr/bin/env node
/**
 * Run the demo AI flow with everything except earrings:
 * shirt (clothing) + headphones + eyeglasses (non-clothing).
 */
process.env.DEMO_PRODUCT_MODE = "no-earrings";
process.env.DEMO_SERIES_NAME_PREFIX =
  process.env.DEMO_SERIES_NAME_PREFIX || "Demo No-Earrings Series";

require("./demoSeriesEpisodeFlow");
