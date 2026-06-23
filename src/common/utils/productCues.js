const mongoose = require("mongoose");

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const assertObjectId = (id, label = "id") => {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, `Invalid ${label}`);
  }
};

/**
 * Normalize episode product cues (timestamp → showcase card).
 * Pass `series` so cues may reference `seriesProductId` and inherit image/link from series.products.
 */
const parseProductCuesInput = (raw, series = null) => {
  if (raw === undefined || raw === null || raw === "") {
    return [];
  }
  let arr = raw;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      throw httpError(400, "productCues must be valid JSON array when sent as string");
    }
  }
  if (!Array.isArray(arr)) {
    throw httpError(400, "productCues must be an array");
  }

  const out = [];
  for (let i = 0; i < arr.length; i += 1) {
    const c = arr[i];
    if (!c || typeof c !== "object") {
      throw httpError(400, `productCues[${i}] must be an object`);
    }
    const ts = Number(c.timestampSeconds);
    if (!Number.isFinite(ts) || ts < 0) {
      throw httpError(400, `productCues[${i}].timestampSeconds must be a non-negative number`);
    }

    let purchaseLink = c.purchaseLink != null ? String(c.purchaseLink).trim() : "";
    let imageUrl = c.imageUrl != null ? String(c.imageUrl).trim() : "";
    let imageKey = c.imageKey != null ? String(c.imageKey).trim() : "";
    const title = c.title != null ? String(c.title).trim().slice(0, 200) : "";

    const bboxRaw = c.bbox;
    let bbox;
    if (bboxRaw != null && bboxRaw !== "") {
      if (!Array.isArray(bboxRaw) || bboxRaw.length !== 4) {
        throw httpError(400, `productCues[${i}].bbox must be [x1, y1, x2, y2]`);
      }
      bbox = bboxRaw.map((n) => Number(n));
      if (bbox.some((n) => !Number.isFinite(n))) {
        throw httpError(400, `productCues[${i}].bbox must contain numbers`);
      }
      if (bbox[2] <= bbox[0] || bbox[3] <= bbox[1]) {
        throw httpError(400, `productCues[${i}].bbox must have x2>x1 and y2>y1`);
      }
    }

    const detectionCategory =
      c.detectionCategory != null ? String(c.detectionCategory).trim().toLowerCase().slice(0, 80) : "";
    let detectionType;
    if (c.detectionType != null && c.detectionType !== "") {
      const dt = String(c.detectionType).trim().toLowerCase();
      if (!["clothing", "object"].includes(dt)) {
        throw httpError(400, `productCues[${i}].detectionType must be clothing or object`);
      }
      detectionType = dt;
    }

    let seriesProductId;
    if (c.seriesProductId != null && c.seriesProductId !== "") {
      assertObjectId(String(c.seriesProductId), `productCues[${i}].seriesProductId`);
      seriesProductId = new mongoose.Types.ObjectId(String(c.seriesProductId));
      if (series) {
        const catalog = series.products || [];
        const p = catalog.find((pr) => String(pr._id) === String(seriesProductId));
        if (!p) {
          throw httpError(400, `productCues[${i}].seriesProductId does not match a series product`);
        }
        if (!imageUrl) {
          imageUrl = p.imageUrl || "";
        }
        if (!purchaseLink) {
          purchaseLink = p.purchaseLink != null ? String(p.purchaseLink).trim() : "";
        }
        if (!imageKey && p.imageKey) {
          imageKey = String(p.imageKey).trim();
        }
      }
    }

    if (!imageUrl && !bbox) {
      throw httpError(
        400,
        `productCues[${i}].imageUrl is required (unless seriesProductId points at a catalog product or bbox is provided)`
      );
    }

    const entry = {
      timestampSeconds: ts,
      purchaseLink,
      imageUrl,
      imageKey,
      title,
    };
    const endTs = Number(c.endTimestampSeconds);
    if (Number.isFinite(endTs) && endTs > ts) {
      entry.endTimestampSeconds = endTs;
    }
    const displayDuration = Number(c.displayDurationSeconds);
    if (Number.isFinite(displayDuration) && displayDuration > 0) {
      entry.displayDurationSeconds = Math.min(600, Math.max(0.1, displayDuration));
    } else if (entry.endTimestampSeconds != null) {
      entry.displayDurationSeconds = Math.min(600, Math.max(0.1, entry.endTimestampSeconds - ts));
    }
    if (bbox) {
      entry.bbox = bbox;
    }
    if (detectionCategory) {
      entry.detectionCategory = detectionCategory;
    }
    if (detectionType) {
      entry.detectionType = detectionType;
    }
    if (seriesProductId) {
      entry.seriesProductId = seriesProductId;
    }
    out.push(entry);
  }

  out.sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  return out;
};

module.exports = {
  parseProductCuesInput,
};
