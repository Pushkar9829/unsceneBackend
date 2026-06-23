/**
 * Seed AI detection callback (clothing/objects + bbox) into episode.productCues.
 *
 * Creates the demo series/episodes/products if missing, then applies the callback
 * via the same path as POST /api/v1/internal/ai/product-cues/callback.
 *
 * Env:
 *   SEED_AI_CALLBACK_PATH — JSON file (default: docs/fixtures/AI_DETECTION_CALLBACK.json)
 *   SEED_SERIES_SETUP_PATH — series/episodes/products fixture (default: docs/fixtures/AI_TEST_PAYLOAD.json → analyzeJobRequest)
 *
 * Run: npm run seed:ai-detection
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const connectDb = require("../config/db");
const env = require("../config/env");
const { normalizePhoneForDb } = require("../common/utils/phone");
const User = require("../modules/user/user.model");
const Series = require("../modules/series/series.model");
const Genre = require("../modules/genre/genre.model");
const { applyProductCueResults } = require("../common/services/aiIngest.service");

const DEFAULT_CALLBACK = path.resolve(__dirname, "../../docs/fixtures/AI_DETECTION_CALLBACK.json");
const DEFAULT_SETUP = path.resolve(__dirname, "../../docs/fixtures/AI_TEST_PAYLOAD.json");

const oid = (id) => new mongoose.Types.ObjectId(String(id));

const loadJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const ensureDemoUser = async () => {
  const phone = normalizePhoneForDb(env.demoPhone || "9999999999");
  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({ phone, name: "AI Detection Demo" });
    console.log("[seed] Created demo user", { userId: user._id, phone });
  }
  return user;
};

const buildProducts = (products) =>
  (products || []).map((p) => ({
    _id: oid(p.productId),
    imageUrl: String(p.imageUrl || "").trim(),
    imageKey: String(p.imageKey || "").trim(),
    purchaseLink: String(p.purchaseLink || "").trim(),
    category: p.category === "non-clothing" ? "non-clothing" : "clothing",
  }));

const buildEpisodes = (episodes) =>
  (episodes || []).map((ep) => ({
    _id: oid(ep.episodeId),
    order: Number(ep.order) || 0,
    title: ep.title != null ? String(ep.title) : "",
    videoKey: String(ep.videoKey || "").trim(),
    videoUrl: String(ep.videoUrl || "").trim(),
    productCues: [],
  }));

const ensureSeries = async (userId, setup) => {
  const seriesId = String(setup.seriesId);
  const genre = await Genre.findOne({ isActive: true }).sort({ name: 1 });
  const products = buildProducts(setup.products);
  const episodes = buildEpisodes(setup.episodes);

  const payload = {
    user: userId,
    name: setup.series?.name != null ? String(setup.series.name) : "AI Bbox Demo",
    type: setup.series?.type || "micro_drama",
    genreId: genre?._id,
    genreName: genre?.name || "",
    status: "submitted",
    featured: true,
    catalogHidden: false,
    products,
    episodes,
    episodeCount: episodes.length,
    productCount: products.length,
    aiProcessingStatus: "idle",
  };

  let series = await Series.findById(seriesId);
  if (!series) {
    series = await Series.create({ _id: oid(seriesId), ...payload });
    console.log("[seed] Created series", { seriesId, episodes: episodes.length, products: products.length });
    return series;
  }

  series.set(payload);
  series.markModified("episodes");
  series.markModified("products");
  await series.save();
  console.log("[seed] Updated series", { seriesId, episodes: episodes.length, products: products.length });
  return series;
};

const run = async () => {
  await connectDb();

  const callbackPath = process.env.SEED_AI_CALLBACK_PATH
    ? path.resolve(process.env.SEED_AI_CALLBACK_PATH)
    : DEFAULT_CALLBACK;
  const setupPath = process.env.SEED_SERIES_SETUP_PATH
    ? path.resolve(process.env.SEED_SERIES_SETUP_PATH)
    : DEFAULT_SETUP;

  if (!fs.existsSync(callbackPath)) {
    throw new Error(`Callback fixture not found: ${callbackPath}`);
  }
  if (!fs.existsSync(setupPath)) {
    throw new Error(`Series setup fixture not found: ${setupPath}`);
  }

  const callbackBody = loadJson(callbackPath);
  const setupFile = loadJson(setupPath);
  const setup = setupFile.analyzeJobRequest || setupFile;

  const user = await ensureDemoUser();
  await ensureSeries(user._id, setup);

  const seriesId = String(callbackBody.seriesId || setup.seriesId);
  const result = await applyProductCueResults(seriesId, callbackBody);

  const series = await Series.findById(seriesId).lean();
  const cueSummary = (series?.episodes || []).map((ep) => ({
    episodeId: String(ep._id),
    cueCount: ep.productCues?.length || 0,
    withBbox: (ep.productCues || []).filter((c) => Array.isArray(c.bbox) && c.bbox.length === 4).length,
  }));

  console.log("AI detection cues seeded", {
    ...result,
    seriesId,
    episodes: cueSummary,
  });
  process.exit(0);
};

run().catch((err) => {
  console.error("seedAiDetectionCues failed", err?.message || err);
  process.exit(1);
});
