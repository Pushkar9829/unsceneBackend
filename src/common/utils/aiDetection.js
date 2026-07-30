/**
 * Convert AI detection callback (clothing/objects + ranges + bbox) into productCues
 * stored on episodes for the mobile player.
 */

/** Max visibility window for a single detection range (avoids 1s "shirt on face" drift). */
const MAX_DETECTION_RANGE_SEC = 0.5;
/** Default end when AI omits/invalidates end (must stay well under 1s). */
const DEFAULT_DETECTION_RANGE_SEC = 0.4;

const GENERIC_LABELS = new Set(["non-clothing", "non clothing", "clothing", "object"]);

/** Fine-grained clothing AI labels → display / match as clothing. */
const CLOTHING_TYPE_LABELS = new Set([
  "clothing",
  "apparel",
  "outfit",
  "shirt",
  "tshirt",
  "t-shirt",
  "tee",
  "top",
  "blouse",
  "trousers",
  "pants",
  "jeans",
  "shorts",
  "dress",
  "skirt",
  "jacket",
  "coat",
  "hoodie",
  "sweater",
  "jumper",
  "kurta",
  "saree",
  "sari",
  "suit",
  "blazer",
  "cardigan",
  "vest",
  "tank",
  "romper",
  "jumpsuit",
]);

/**
 * Synonym groups so "glasses"/"specs" do not round-robin onto "headphones".
 * First token in each group is the canonical key.
 */
const OBJECT_SYNONYM_GROUPS = [
  ["glasses", "spectacles", "specs", "eyeglasses", "sunglasses", "eyewear", "frames"],
  ["headphones", "earphones", "earbuds", "headset", "airpods", "earpiece"],
  ["watch", "wristwatch", "smartwatch"],
  ["bag", "handbag", "purse", "backpack", "tote"],
  ["belt", "waistbelt"],
  ["hat", "cap", "beanie"],
  ["necklace", "pendant", "chain"],
  ["earrings", "earring"],
  ["bracelet", "bangle"],
  ["ring", "rings"],
  ["shoes", "sneakers", "boots", "heels", "sandals", "footwear"],
  ["phone", "mobile", "smartphone"],
  ["laptop", "notebook", "macbook"],
  ["camera", "dslr"],
  ["perfume", "fragrance", "cologne"],
];

const synonymLookup = (() => {
  const map = new Map();
  for (const group of OBJECT_SYNONYM_GROUPS) {
    const canonical = group[0];
    for (const alias of group) {
      map.set(alias, canonical);
    }
  }
  return map;
})();

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

const normalizeToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const canonicalLabel = (value) => {
  const token = normalizeToken(value);
  if (!token) {
    return "";
  }
  if (CLOTHING_TYPE_LABELS.has(token) || token.split(/\s+/).every((t) => CLOTHING_TYPE_LABELS.has(t))) {
    return "clothing";
  }
  if (synonymLookup.has(token)) {
    return synonymLookup.get(token);
  }
  for (const part of token.split(" ")) {
    if (synonymLookup.has(part)) {
      return synonymLookup.get(part);
    }
  }
  return token;
};

const productMatchText = (product) => {
  const title = normalizeToken(product?.title);
  const link = normalizeToken(product?.purchaseLink);
  return `${title} ${link}`.trim();
};

const productMatchesCategory = (product, category) => {
  const want = canonicalLabel(category);
  if (!want) {
    return false;
  }
  const hay = productMatchText(product);
  if (!hay) {
    return false;
  }
  const hayCanon = canonicalLabel(hay);
  if (hayCanon === want) {
    return true;
  }
  if (hay.includes(want)) {
    return true;
  }
  // Synonym group membership (e.g. product titled "spectacles", category "specs")
  for (const part of hay.split(/\s+/)) {
    if (canonicalLabel(part) === want) {
      return true;
    }
  }
  return false;
};

/**
 * Prefer catalog product name; for clothing detections use "Clothing" instead of shirt/tshirt/etc.
 * Prefer detection category over purchaseLink when link text looks like a different object class.
 */
const cueTitleFromProduct = (product, category, detectionType) => {
  const cat = String(category || "").trim().toLowerCase();
  const isClothing =
    detectionType === "clothing" || CLOTHING_TYPE_LABELS.has(cat) || canonicalLabel(cat) === "clothing";

  const explicit = product?.title != null ? String(product.title).trim() : "";
  if (explicit && !GENERIC_LABELS.has(explicit.toLowerCase())) {
    if (isClothing && CLOTHING_TYPE_LABELS.has(normalizeToken(explicit))) {
      return "Clothing";
    }
    return explicit;
  }

  if (isClothing) {
    return "Clothing";
  }

  const catCanon = canonicalLabel(cat);
  if (cat && !GENERIC_LABELS.has(cat) && !CLOTHING_TYPE_LABELS.has(cat)) {
    const purchaseLink = product?.purchaseLink != null ? String(product.purchaseLink).trim() : "";
    if (purchaseLink) {
      const linkCanon = canonicalLabel(purchaseLink);
      // Avoid "headphones" title when detection was "glasses"
      if (linkCanon && catCanon && linkCanon !== catCanon) {
        return titleFromCategory(catCanon);
      }
      return purchaseLink.charAt(0).toUpperCase() + purchaseLink.slice(1);
    }
    return titleFromCategory(catCanon || category);
  }

  const purchaseLink = product?.purchaseLink != null ? String(product.purchaseLink).trim() : "";
  if (purchaseLink) {
    return purchaseLink.charAt(0).toUpperCase() + purchaseLink.slice(1);
  }
  return "";
};

const resolveProductIdFromDetection = (item, range) => {
  const candidates = [range?.productId, range?.seriesProductId, item?.productId, item?.seriesProductId];
  for (const raw of candidates) {
    if (raw != null && String(raw).trim()) {
      return String(raw).trim();
    }
  }
  return "";
};

const resolveCropImageUrl = (range) => {
  const candidates = [range?.cropImageUrl, range?.detectionImageUrl, range?.imageUrl];
  for (const raw of candidates) {
    const url = raw != null ? String(raw).trim() : "";
    if (url) {
      return url;
    }
  }
  return "";
};

const clampDetectionWindow = (start, endRaw) => {
  let end = Number(endRaw);
  if (!Number.isFinite(end) || end <= start) {
    end = start + DEFAULT_DETECTION_RANGE_SEC;
  }
  if (end - start > MAX_DETECTION_RANGE_SEC) {
    end = start + MAX_DETECTION_RANGE_SEC;
  }
  return end;
};

/**
 * Pick best catalog product for a detection: explicit id → synonym match → unused bucket item.
 * Avoids round-robin assigning glasses detections to headphones products.
 */
const pickProductForDetection = (products, category, preferredId, usedIds) => {
  if (!products.length) {
    return null;
  }

  if (preferredId) {
    const byId = products.find((p) => String(p._id) === preferredId);
    if (byId) {
      usedIds.add(String(byId._id));
      return byId;
    }
  }

  const matched = products.filter((p) => productMatchesCategory(p, category));
  const unusedMatch = matched.find((p) => !usedIds.has(String(p._id)));
  if (unusedMatch) {
    usedIds.add(String(unusedMatch._id));
    return unusedMatch;
  }
  if (matched.length) {
    return matched[0];
  }

  // Last resort: first unused product in bucket (never cycle blindly across categories).
  const unused = products.find((p) => !usedIds.has(String(p._id)));
  if (unused) {
    usedIds.add(String(unused._id));
    return unused;
  }
  return products[0];
};

const pushRangeCue = (out, range, category, detectionType, products, usedIds, item) => {
  const start = Number(range?.start);
  if (!Number.isFinite(start) || start < 0) {
    return;
  }
  const bbox = normalizeBbox(range?.bbox);
  if (!bbox) {
    return;
  }

  const end = clampDetectionWindow(start, range?.end);
  const preferredId = resolveProductIdFromDetection(item, range);
  const product = pickProductForDetection(products, category, preferredId, usedIds);
  const cropUrl = resolveCropImageUrl(range);

  // A detection outside this series' catalog is not shoppable. For example,
  // ignore shirt detections during a non-clothing-only analysis instead of
  // creating an invalid cue without a product image or purchase link.
  if (!product && !cropUrl) {
    return;
  }

  const entry = {
    timestampSeconds: start,
    endTimestampSeconds: end,
    displayDurationSeconds: Math.max(0.1, Math.min(MAX_DETECTION_RANGE_SEC, end - start)),
    bbox,
    detectionCategory:
      detectionType === "clothing" || CLOTHING_TYPE_LABELS.has(String(category || "").trim().toLowerCase())
        ? "clothing"
        : String(category || "").trim().toLowerCase(),
    detectionType,
    title: product
      ? cueTitleFromProduct(product, category, detectionType)
      : detectionType === "clothing"
        ? "Clothing"
        : titleFromCategory(canonicalLabel(category) || category),
  };

  if (product) {
    entry.seriesProductId = product._id;
    // Prefer AI crop of the detected region for the in-player miniature icon.
    entry.imageUrl = cropUrl || (product.imageUrl != null ? String(product.imageUrl).trim() : "");
    entry.imageKey = product.imageKey != null ? String(product.imageKey).trim() : "";
    entry.purchaseLink = product.purchaseLink != null ? String(product.purchaseLink).trim() : "";
  } else if (cropUrl) {
    entry.imageUrl = cropUrl;
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
  const clothingUsed = new Set();
  const objectUsed = new Set();

  for (const item of clothing) {
    const category = String(item?.category || "clothing").trim().toLowerCase() || "clothing";
    for (const range of item?.ranges || []) {
      pushRangeCue(out, range, category, "clothing", clothingProducts, clothingUsed, item);
    }
  }

  for (const item of objects) {
    const category = String(item?.category || "").trim().toLowerCase();
    for (const range of item?.ranges || []) {
      pushRangeCue(out, range, category, "object", objectProducts, objectUsed, item);
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
  canonicalLabel,
  clampDetectionWindow,
  MAX_DETECTION_RANGE_SEC,
  DEFAULT_DETECTION_RANGE_SEC,
  CLOTHING_TYPE_LABELS,
};
