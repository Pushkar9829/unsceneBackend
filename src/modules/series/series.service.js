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
const { parseProductCuesInput } = require("../../common/utils/productCues");
const { queueSeriesAiAnalysis } = require("../../common/services/aiIngest.service");

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
  if (payload.status === "submitted" && updated) {
    queueSeriesAiAnalysis(String(seriesId)).catch((err) => {
      console.error("[ai-ingest] queue after submit failed", seriesId, err?.message || err);
    });
  }
  return updated;
};

const triggerSeriesAiAnalysis = async (userId, seriesId) => {
  await requireSeriesOwner(userId, seriesId);
  return queueSeriesAiAnalysis(String(seriesId));
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
  triggerSeriesAiAnalysis,
};
