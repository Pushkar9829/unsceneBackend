/**
 * Convert AI detection callback (clothing/objects + ranges + bbox) into productCues
 * stored on episodes for the mobile player.
 */
const normalizeBbox = (raw) => {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return null;
  }
  const nums = raw.map((n) => Number(n));
  if (nums.some((n) => !Number.isFinite(n))) {
    return null;
  }
  const [x1, y1, x2, y2] = nums;
  if (x2 <= x1 || y2 <= y1) {
    return null;
  }
  return nums;
};

const titleFromCategory = (category) => {
  const c = String(category || "").trim();
  if (!c) {
    return "";
  }
  return c.charAt(0).toUpperCase() + c.slice(1);
};

const pushRangeCue = (out, range, category, detectionType, products, indexRef) => {
  const start = Number(range?.start);
  if (!Number.isFinite(start) || start < 0) {
    return;
  }
  const bbox = normalizeBbox(range?.bbox);
  if (!bbox) {
    return;
  }

  let end = Number(range?.end);
  if (!Number.isFinite(end) || end <= start) {
    end = start + 1;
  }

  const product = products.length ? products[indexRef.idx % products.length] : null;
  if (products.length) {
    indexRef.idx += 1;
  }

  const entry = {
    timestampSeconds: start,
    endTimestampSeconds: end,
    displayDurationSeconds: Math.max(0.1, Math.min(600, end - start)),
    bbox,
    detectionCategory: String(category || "").trim().toLowerCase(),
    detectionType,
    title: titleFromCategory(category),
  };

  if (product) {
    entry.seriesProductId = product._id;
    entry.imageUrl = product.imageUrl != null ? String(product.imageUrl).trim() : "";
    entry.imageKey = product.imageKey != null ? String(product.imageKey).trim() : "";
    entry.purchaseLink = product.purchaseLink != null ? String(product.purchaseLink).trim() : "";
  }

  out.push(entry);
};

/**
 * @param {object} episodeResult - { episodeId, clothing?, objects?, cues? }
 * @param {object} series - Mongoose series doc with products[]
 * @returns {object[]} raw cues for parseProductCuesInput
 */
const convertAiEpisodeDetectionToCues = (episodeResult, series) => {
  const clothing = Array.isArray(episodeResult?.clothing) ? episodeResult.clothing : [];
  const objects = Array.isArray(episodeResult?.objects) ? episodeResult.objects : [];
  if (!clothing.length && !objects.length) {
    return [];
  }

  const clothingProducts = (series.products || []).filter((p) => p.category === "clothing");
  const objectProducts = (series.products || []).filter((p) => p.category === "non-clothing");

  const out = [];
  const clothingIdx = { idx: 0 };
  const objectIdx = { idx: 0 };

  for (const item of clothing) {
    const category = String(item?.category || "").trim().toLowerCase();
    for (const range of item?.ranges || []) {
      pushRangeCue(out, range, category, "clothing", clothingProducts, clothingIdx);
    }
  }

  for (const item of objects) {
    const category = String(item?.category || "").trim().toLowerCase();
    for (const range of item?.ranges || []) {
      pushRangeCue(out, range, category, "object", objectProducts, objectIdx);
    }
  }

  return out;
};

const isAiDetectionEpisodeShape = (episodeResult) =>
  Array.isArray(episodeResult?.clothing) || Array.isArray(episodeResult?.objects);

module.exports = {
  convertAiEpisodeDetectionToCues,
  isAiDetectionEpisodeShape,
  normalizeBbox,
};
