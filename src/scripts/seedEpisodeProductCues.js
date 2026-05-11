/**
 * Seeds timestamp-based productCues on series episodes using an existing catalog product.
 *
 * Defaults match the sample series you shared; override via env:
 *   SEED_SERIES_ID, SEED_PRODUCT_ID (optional; else first product on the series)
 *
 * Run: npm run seed:product-cues
 */
const mongoose = require("mongoose");
const connectDb = require("../config/db");
const Series = require("../modules/series/series.model");

const DEFAULT_SERIES_ID = "69fe36c51f3977b48b2e7782";

/** Per-episode demo timestamps (seconds) — same product card at each time. */
const DEMO_CUES_BY_EPISODE_ORDER = {
  1: [5, 22],
  2: [8, 35],
};

const buildCuesForProduct = (product, timestampList) => {
  const purchaseLink = product.purchaseLink != null ? String(product.purchaseLink).trim() : "";
  const imageUrl = product.imageUrl != null ? String(product.imageUrl).trim() : "";
  const imageKey = product.imageKey != null ? String(product.imageKey).trim() : "";
  if (!imageUrl) {
    throw new Error("Product has no imageUrl; cannot build cues");
  }
  return timestampList.map((timestampSeconds, idx) => ({
    timestampSeconds: Number(timestampSeconds),
    purchaseLink,
    imageUrl,
    imageKey,
    title: idx === 0 ? "Shop this look" : "Shop this look",
    seriesProductId: product._id,
  }));
};

const run = async () => {
  await connectDb();

  const seriesId = process.env.SEED_SERIES_ID || DEFAULT_SERIES_ID;
  if (!mongoose.isValidObjectId(seriesId)) {
    throw new Error(`Invalid SEED_SERIES_ID / default: ${seriesId}`);
  }

  const series = await Series.findById(seriesId);
  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  const productIdEnv = process.env.SEED_PRODUCT_ID?.trim();
  let product;
  if (productIdEnv && mongoose.isValidObjectId(productIdEnv)) {
    product = series.products.id(productIdEnv);
  } else {
    product = series.products?.[0];
  }
  if (!product) {
    throw new Error("No product on this series (add a product first or set SEED_PRODUCT_ID)");
  }

  const episodes = [...series.episodes].sort((a, b) => Number(a.order) - Number(b.order));
  if (!episodes.length) {
    throw new Error("Series has no episodes");
  }

  for (const ep of episodes) {
    const order = Number(ep.order);
    const tsList = DEMO_CUES_BY_EPISODE_ORDER[order] || [10, 40];
    const cues = buildCuesForProduct(product, tsList);
    cues.sort((a, b) => a.timestampSeconds - b.timestampSeconds);
    const sub = series.episodes.id(ep._id);
    if (!sub) {
      continue;
    }
    sub.set("productCues", cues);
  }

  await series.save();
  console.log("Episode productCues seeded", {
    seriesId,
    seriesName: series.name,
    productId: String(product._id),
    episodes: episodes.map((e) => ({
      episodeId: String(e._id),
      order: e.order,
      title: e.title,
      cues: series.episodes.id(e._id)?.productCues?.length ?? 0,
    })),
  });

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("seedEpisodeProductCues failed", err);
  mongoose.disconnect().finally(() => process.exit(1));
});
