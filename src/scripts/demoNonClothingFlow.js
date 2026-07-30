#!/usr/bin/env node
/**
 * Run the demo AI flow with non-clothing catalog products only:
 * earrings, headphones, and eyeglasses.
 *
 * The shared flow still uploads the episode and all three product images to S3,
 * but its outbound AI request contains no clothing products.
 */
process.env.DEMO_PRODUCT_MODE = "non-clothing";
process.env.DEMO_SERIES_NAME_PREFIX =
  process.env.DEMO_SERIES_NAME_PREFIX || "Demo Non-Clothing Series";

require("./demoSeriesEpisodeFlow");
