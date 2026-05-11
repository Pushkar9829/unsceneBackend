const mongoose = require("mongoose");
const { SERIES_TYPES } = require("../../config/constants");
const {
  getPresignedUploadUrl,
  getPublicFileUrl,
  uploadBufferToS3,
} = require("../../common/services/s3.service");
const {
  createSeries,
  findSeriesById,
  findSeriesByUser,
  findSeriesCatalog,
  updateSeriesById,
  addEpisodeToSeries,
  addProductToSeries,
  updateEpisodeFieldsBySubdocId,
} = require("./series.repository");
const { getGenreById } = require("../genre/genre.service");
const { creatorSeriesStatsSummary } = require("../analytics/analytics.service");

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const parseOptionalNonNegativeInt = (value, label) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw httpError(400, `${label} must be a non-negative integer`);
  }
  return n;
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

    if (!imageUrl) {
      throw httpError(
        400,
        `productCues[${i}].imageUrl is required (unless seriesProductId points at a catalog product while updating)`
      );
    }

    const entry = {
      timestampSeconds: ts,
      purchaseLink,
      imageUrl,
      imageKey,
      title,
    };
    const displayDuration = Number(c.displayDurationSeconds);
    if (Number.isFinite(displayDuration) && displayDuration > 0) {
      entry.displayDurationSeconds = Math.min(600, Math.max(0.1, displayDuration));
    }
    if (seriesProductId) {
      entry.seriesProductId = seriesProductId;
    }
    out.push(entry);
  }

  out.sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  return out;
};

const requireSeriesOwner = async (userId, seriesId) => {
  assertObjectId(seriesId, "seriesId");
  const series = await findSeriesById(seriesId);
  if (!series) {
    throw httpError(404, "Series not found");
  }
  if (String(series.user) !== String(userId)) {
    throw httpError(403, "Forbidden");
  }
  return series;
};

const createUserSeries = async (userId, { name, type, episodeCount, productCount, genreId }) => {
  const payload = { user: userId };
  if (name !== undefined && name !== null) {
    payload.name = String(name).trim().slice(0, 200);
  }
  if (type !== undefined && type !== null && type !== "") {
    if (!SERIES_TYPES.includes(type)) {
      throw httpError(400, `type must be one of: ${SERIES_TYPES.join(", ")}`);
    }
    payload.type = type;
  }
  const ec = parseOptionalNonNegativeInt(episodeCount, "episodeCount");
  const pc = parseOptionalNonNegativeInt(productCount, "productCount");
  if (ec !== undefined) {
    payload.episodeCount = ec;
  }
  if (pc !== undefined) {
    payload.productCount = pc;
  }
  if (genreId !== undefined && genreId !== null && genreId !== "") {
    assertObjectId(genreId, "genreId");
    const genre = await getGenreById(genreId);
    if (!genre || !genre.isActive) {
      throw httpError(400, "Invalid genreId");
    }
    payload.genreId = genre._id;
    payload.genreName = genre.name;
  }
  const created = await createSeries(payload);
  return created.toObject({ versionKey: false });
};

const presignSeriesUpload = async (userId, seriesId, { assetType, fileName, contentType }) => {
  await requireSeriesOwner(userId, seriesId);

  if (!["episode", "product"].includes(assetType)) {
    throw httpError(400, "assetType must be 'episode' or 'product'");
  }

  if (!fileName || String(fileName).trim() === "") {
    throw httpError(400, "fileName is required");
  }

  const folderByType = {
    episode: `users/${userId}/series/${seriesId}/episodes`,
    product: `users/${userId}/series/${seriesId}/products`,
  };
  const folder = folderByType[assetType];

  return getPresignedUploadUrl({
    folder,
    fileName,
    contentType: contentType || "application/octet-stream",
    expiresInSeconds: 600,
  });
};

const registerEpisode = async (userId, seriesId, { title, order, videoKey, productCues }) => {
  const series = await requireSeriesOwner(userId, seriesId);
  if (!videoKey || String(videoKey).trim() === "") {
    throw httpError(400, "videoKey is required");
  }

  const videoUrl = getPublicFileUrl(videoKey);
  const episode = {
    title: title != null ? String(title).trim() : "",
    order: order !== undefined && order !== null ? Number(order) : 0,
    videoKey,
    videoUrl,
    productCues: parseProductCuesInput(productCues, series),
  };

  const updated = await addEpisodeToSeries(seriesId, episode);
  if (!updated) {
    throw httpError(404, "Series not found");
  }
  return updated;
};

const registerProduct = async (userId, seriesId, { purchaseLink, imageKey, category }) => {
  await requireSeriesOwner(userId, seriesId);
  if (!imageKey || String(imageKey).trim() === "") {
    throw httpError(400, "imageKey is required");
  }
  if (!["clothing", "non-clothing"].includes(category)) {
    throw httpError(400, "category must be 'clothing' or 'non-clothing'");
  }

  const imageUrl = getPublicFileUrl(imageKey);
  const product = {
    purchaseLink: purchaseLink != null ? String(purchaseLink).trim() : "",
    imageKey,
    imageUrl,
    category,
  };

  const updated = await addProductToSeries(seriesId, product);
  if (!updated) {
    throw httpError(404, "Series not found");
  }
  return updated;
};

const uploadEpisodeAndRegister = async (
  userId,
  seriesId,
  { title, order, productCues },
  file
) => {
  await requireSeriesOwner(userId, seriesId);
  if (!file?.buffer) {
    throw httpError(400, "episode file is required");
  }
  const uploaded = await uploadBufferToS3({
    folder: `users/${userId}/series/${seriesId}/episodes`,
    fileName: file.originalname || "episode.mp4",
    contentType: file.mimetype || "application/octet-stream",
    body: file.buffer,
  });
  return registerEpisode(userId, seriesId, {
    title,
    order,
    videoKey: uploaded.key,
    productCues,
  });
};

const uploadProductAndRegister = async (
  userId,
  seriesId,
  { purchaseLink, category },
  file
) => {
  await requireSeriesOwner(userId, seriesId);
  if (!file?.buffer) {
    throw httpError(400, "product image is required");
  }
  const uploaded = await uploadBufferToS3({
    folder: `users/${userId}/series/${seriesId}/products`,
    fileName: file.originalname || "product.jpg",
    contentType: file.mimetype || "application/octet-stream",
    body: file.buffer,
  });
  return registerProduct(userId, seriesId, {
    purchaseLink,
    category,
    imageKey: uploaded.key,
  });
};

const uploadThumbnailAndRegister = async (userId, seriesId, file) => {
  await requireSeriesOwner(userId, seriesId);
  if (!file?.buffer) {
    throw httpError(400, "thumbnail image is required");
  }
  const uploaded = await uploadBufferToS3({
    folder: `users/${userId}/series/${seriesId}/thumbnail`,
    fileName: file.originalname || "thumbnail.jpg",
    contentType: file.mimetype || "application/octet-stream",
    body: file.buffer,
  });
  const updated = await updateSeriesById(seriesId, {
    thumbnailKey: uploaded.key,
    thumbnailUrl: uploaded.publicUrl,
  });
  if (!updated) {
    throw httpError(404, "Series not found");
  }
  return updated;
};

const updateUserSeries = async (userId, seriesId, payload) => {
  await requireSeriesOwner(userId, seriesId);
  const update = {};
  if (payload.episodeCount !== undefined) {
    const ec = parseOptionalNonNegativeInt(payload.episodeCount, "episodeCount");
    if (ec !== undefined) {
      update.episodeCount = ec;
    }
  }
  if (payload.productCount !== undefined) {
    const pc = parseOptionalNonNegativeInt(payload.productCount, "productCount");
    if (pc !== undefined) {
      update.productCount = pc;
    }
  }
  if (payload.status !== undefined) {
    if (!["draft", "submitted"].includes(payload.status)) {
      throw httpError(400, "status must be 'draft' or 'submitted'");
    }
    update.status = payload.status;
  }
  if (payload.type !== undefined && payload.type !== null && payload.type !== "") {
    if (!SERIES_TYPES.includes(payload.type)) {
      throw httpError(400, `type must be one of: ${SERIES_TYPES.join(", ")}`);
    }
    update.type = payload.type;
  }
  if (payload.name !== undefined && payload.name !== null) {
    update.name = String(payload.name).trim().slice(0, 200);
  }
  if (payload.genreId !== undefined) {
    if (payload.genreId === null || payload.genreId === "") {
      update.genreId = null;
      update.genreName = "";
    } else {
      assertObjectId(payload.genreId, "genreId");
      const genre = await getGenreById(payload.genreId);
      if (!genre || !genre.isActive) {
        throw httpError(400, "Invalid genreId");
      }
      update.genreId = genre._id;
      update.genreName = genre.name;
    }
  }

  const updated = await updateSeriesById(seriesId, update);
  return updated;
};

const getSeriesForUser = async (userId, seriesId) => {
  await requireSeriesOwner(userId, seriesId);
  return findSeriesById(seriesId).select("-__v").lean();
};

const patchUserSeriesEpisode = async (userId, seriesId, episodeId, payload = {}) => {
  const series = await requireSeriesOwner(userId, seriesId);
  assertObjectId(episodeId, "episodeId");
  const ep = typeof series.episodes?.id === "function" ? series.episodes.id(episodeId) : null;
  if (!ep) {
    throw httpError(404, "Episode not found");
  }

  const fields = {};
  if (payload.title !== undefined) {
    fields.title = payload.title != null ? String(payload.title).trim() : "";
  }
  if (payload.order !== undefined && payload.order !== null) {
    const ord = Number(payload.order);
    if (!Number.isFinite(ord)) {
      throw httpError(400, "order must be a number");
    }
    fields.order = ord;
  }
  if (payload.productCues !== undefined) {
    fields.productCues = parseProductCuesInput(payload.productCues, series);
  }

  if (Object.keys(fields).length === 0) {
    return findSeriesById(seriesId).select("-__v").lean();
  }

  const updated = await updateEpisodeFieldsBySubdocId(seriesId, episodeId, fields);
  if (!updated) {
    throw httpError(404, "Series not found");
  }
  return updated.toObject({ versionKey: false });
};

const listUserSeries = async (userId) => {
  return findSeriesByUser(userId);
};

const SEARCH_DEFAULT_LIMIT = 20;
const SEARCH_MAX_LIMIT = 100;

const searchAllSeries = async (query = {}) => {
  const raw =
    query.q !== undefined && query.q !== null
      ? query.q
      : query.search !== undefined && query.search !== null
        ? query.search
        : query.keyword;

  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) {
    limit = SEARCH_DEFAULT_LIMIT;
  }
  if (limit > SEARCH_MAX_LIMIT) {
    limit = SEARCH_MAX_LIMIT;
  }

  let page = parseInt(query.page, 10);
  if (!Number.isFinite(page) || page < 1) {
    page = 1;
  }

  const skip = (page - 1) * limit;
  const q = raw === undefined || raw === null ? "" : String(raw);
  const genreId = query.genreId || query.genre;
  if (genreId !== undefined && genreId !== null && String(genreId).trim() !== "") {
    assertObjectId(String(genreId).trim(), "genreId");
  }

  const [items, total] = await findSeriesCatalog({
    q,
    status: "submitted",
    genreId: genreId ? String(genreId).trim() : undefined,
    skip,
    limit,
  });

  return {
    items,
    total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
};

const getCreatorSeriesStatsForUser = async (userId, seriesId) =>
  creatorSeriesStatsSummary(seriesId, userId);

module.exports = {
  createUserSeries,
  presignSeriesUpload,
  registerEpisode,
  registerProduct,
  uploadEpisodeAndRegister,
  uploadProductAndRegister,
  uploadThumbnailAndRegister,
  updateUserSeries,
  getSeriesForUser,
  listUserSeries,
  searchAllSeries,
  patchUserSeriesEpisode,
  getCreatorSeriesStatsForUser,
};
