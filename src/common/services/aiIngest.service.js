const crypto = require("crypto");
const mongoose = require("mongoose");
const env = require("../../config/env");
const { AI_PROCESSING_STATUS } = require("../../config/constants");
const { parseProductCuesInput } = require("../utils/productCues");
const {
  convertAiEpisodeDetectionToCues,
  isAiDetectionEpisodeShape,
} = require("../utils/aiDetection");
const { uploadBufferToS3 } = require("./s3.service");
const { logAiExchange } = require("../utils/aiLogger");
const {
  findSeriesById,
  updateSeriesById,
  updateEpisodeFieldsBySubdocId,
} = require("../../modules/series/series.repository");

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const isIngestConfigured = () =>
  Boolean(env.aiIngestEnabled && env.aiServiceUrl && String(env.aiServiceUrl).trim());

const buildCallbackUrl = () =>
  `${env.aiCallbackPublicBaseUrl}/api/v1/internal/ai/product-cues/callback`;

const buildEpisodeAnalyzeEntry = (ep) => {
  const entry = {
    episodeId: String(ep._id),
    title: ep.title != null ? String(ep.title) : "",
    videoUrl: String(ep.videoUrl).trim(),
  };
  const order = Number(ep.order);
  if (Number.isFinite(order) && order > 0) {
    entry.order = order;
  }
  const videoKey = ep.videoKey != null ? String(ep.videoKey).trim() : "";
  if (videoKey) {
    entry.videoKey = videoKey;
  }
  return entry;
};

const buildProductAnalyzeEntry = (p) => {
  const entry = {
    productId: String(p._id),
    imageUrl: String(p.imageUrl || "").trim(),
    purchaseLink: p.purchaseLink != null ? String(p.purchaseLink).trim() : "",
    category: p.category || "non-clothing",
  };
  const imageKey = p.imageKey != null ? String(p.imageKey).trim() : "";
  if (imageKey) {
    entry.imageKey = imageKey;
  }
  return entry;
};

/** Outbound job payload — matches AI service contract (episodes + products with imageKey). */
const buildAnalyzePayload = (series, jobId) => {
  const seriesId = String(series._id);
  const episodes = (series.episodes || [])
    .filter((ep) => ep.videoUrl && String(ep.videoUrl).trim())
    .sort((a, b) => Number(a.order) - Number(b.order))
    .map(buildEpisodeAnalyzeEntry);

  const products = (series.products || []).map(buildProductAnalyzeEntry);

  return {
    jobId,
    seriesId,
    callbackUrl: buildCallbackUrl(),
    episodes,
    products,
  };
};

const normalizeAiCallbackBody = (body) => {
  if (!body || typeof body !== "object") {
    throw httpError(400, "Request body must be a JSON object");
  }

  const status = body.status != null ? String(body.status).trim().toLowerCase() : "";
  if (!status) {
    throw httpError(400, "status is required");
  }
  if (status === "failed") {
    return body;
  }
  if (status !== "completed") {
    throw httpError(400, "status must be 'completed' or 'failed'");
  }
  if (!Array.isArray(body.episodes)) {
    throw httpError(400, "episodes must be an array when status is completed");
  }

  for (let i = 0; i < body.episodes.length; i += 1) {
    const ep = body.episodes[i];
    if (!ep || typeof ep !== "object") {
      throw httpError(400, `episodes[${i}] must be an object`);
    }
    if (!ep.episodeId || !mongoose.isValidObjectId(String(ep.episodeId))) {
      throw httpError(400, `episodes[${i}].episodeId must be a valid id`);
    }

    const hasDetection = isAiDetectionEpisodeShape(ep);
    const hasLegacy = Array.isArray(ep.cues) || Array.isArray(ep.productCues);
    if (!hasDetection && !hasLegacy) {
      throw httpError(
        400,
        `episodes[${i}] must include clothing/objects (detection format) or cues (legacy format)`
      );
    }

    if (hasDetection) {
      ep.clothing = Array.isArray(ep.clothing) ? ep.clothing : [];
      ep.objects = Array.isArray(ep.objects) ? ep.objects : [];
    }
  }

  return body;
};

const validateSeriesForIngest = (series) => {
  if (!series) {
    throw httpError(404, "Series not found");
  }
  const episodes = series.episodes || [];
  const products = series.products || [];
  if (!episodes.length) {
    throw httpError(400, "Series has no episodes");
  }
  if (!products.length) {
    throw httpError(400, "Series has no products");
  }
  const withVideo = episodes.filter((ep) => ep.videoUrl && String(ep.videoUrl).trim());
  if (!withVideo.length) {
    throw httpError(400, "Series has no episodes with videoUrl");
  }
};

const markAiStatus = async (seriesId, fields) => {
  await updateSeriesById(seriesId, fields);
};

const uploadEpisodeCueJson = async (series, episodeId, cues, rawEpisode = null) => {
  try {
    const userId = String(series.user);
    const seriesId = String(series._id);
    const body = Buffer.from(
      JSON.stringify(
        {
          episodeId,
          cues,
          ...(rawEpisode ? { detection: rawEpisode } : {}),
        },
        null,
        0
      ),
      "utf8"
    );
    const uploaded = await uploadBufferToS3({
      folder: `users/${userId}/series/${seriesId}/episodes/${episodeId}/ai`,
      fileName: "product-cues.json",
      contentType: "application/json",
      body,
    });
    return { timestampJsonKey: uploaded.key, timestampJsonUrl: uploaded.publicUrl };
  } catch (err) {
    console.warn("[ai-ingest] optional cue JSON upload failed", err?.message);
    return {};
  }
};

/**
 * Apply AI callback or sync response body to series episodes.
 */
const applyProductCueResults = async (seriesId, body) => {
  if (!mongoose.isValidObjectId(seriesId)) {
    throw httpError(400, "Invalid seriesId");
  }

  const normalized = normalizeAiCallbackBody(body);

  const series = await findSeriesById(seriesId);
  if (!series) {
    throw httpError(404, "Series not found");
  }

  if (
    normalized.jobId &&
    series.aiJobId &&
    String(normalized.jobId).trim() !== String(series.aiJobId).trim()
  ) {
    console.warn(
      "[ai-ingest] callback jobId does not match series.aiJobId",
      { seriesId, callbackJobId: normalized.jobId, expectedJobId: series.aiJobId }
    );
  }

  const status = normalized.status != null ? String(normalized.status).trim().toLowerCase() : "";
  if (status === "failed") {
    const errMsg = normalized.error != null ? String(normalized.error).slice(0, 2000) : "AI processing failed";
    await markAiStatus(seriesId, {
      aiProcessingStatus: AI_PROCESSING_STATUS.FAILED,
      aiError: errMsg,
      aiCompletedAt: new Date(),
    });
    return {
      seriesId,
      aiProcessingStatus: AI_PROCESSING_STATUS.FAILED,
      episodesUpdated: 0,
      totalCues: 0,
      error: errMsg,
    };
  }

  const episodeResults = normalized.episodes;

  let episodesUpdated = 0;
  let totalCues = 0;

  for (const item of episodeResults) {
    const episodeId = item?.episodeId != null ? String(item.episodeId) : "";
    if (!mongoose.isValidObjectId(episodeId)) {
      throw httpError(400, "Each episode entry must include a valid episodeId");
    }
    const ep = typeof series.episodes?.id === "function" ? series.episodes.id(episodeId) : null;
    if (!ep) {
      throw httpError(400, `Episode not found on series: ${episodeId}`);
    }

    const rawCues = isAiDetectionEpisodeShape(item)
      ? convertAiEpisodeDetectionToCues(item, series)
      : item?.cues ?? item?.productCues ?? [];
    const productCues = parseProductCuesInput(rawCues, series);
    const jsonFields = await uploadEpisodeCueJson(
      series,
      episodeId,
      productCues,
      isAiDetectionEpisodeShape(item) ? item : null
    );

    await updateEpisodeFieldsBySubdocId(seriesId, episodeId, {
      productCues,
      ...jsonFields,
    });
    episodesUpdated += 1;
    totalCues += productCues.length;
  }

  const jobId = normalized.jobId != null ? String(normalized.jobId).trim() : "";
  await markAiStatus(seriesId, {
    aiProcessingStatus: AI_PROCESSING_STATUS.COMPLETED,
    aiError: "",
    aiCompletedAt: new Date(),
    ...(jobId ? { aiJobId: jobId } : {}),
  });

  return {
    seriesId,
    aiProcessingStatus: AI_PROCESSING_STATUS.COMPLETED,
    episodesUpdated,
    totalCues,
  };
};

const postAnalyzeJob = async (payload) => {
  const url = `${env.aiServiceUrl}/v1/analyze/jobs`;
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (env.aiServiceApiKey) {
    headers.Authorization = `Bearer ${env.aiServiceApiKey}`;
  }

  logAiExchange("outbound", {
    method: "POST",
    url,
    headers,
    requestBody: payload,
  });

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  logAiExchange("outbound", {
    method: "POST",
    url,
    status: res.status,
    responseBody: data,
    note: res.ok ? "AI service accepted job" : "AI service error",
  });

  return { ok: res.ok, status: res.status, data };
};

/**
 * Queue AI analysis for a series (fire-and-forget safe to call without await).
 */
const queueSeriesAiAnalysis = async (seriesId) => {
  if (!isIngestConfigured()) {
    await markAiStatus(seriesId, { aiProcessingStatus: AI_PROCESSING_STATUS.SKIPPED });
    return { skipped: true, reason: "AI ingest not configured" };
  }

  const series = await findSeriesById(seriesId);
  validateSeriesForIngest(series);

  const jobId = crypto.randomUUID();
  const payload = buildAnalyzePayload(series, jobId);

  await markAiStatus(seriesId, {
    aiProcessingStatus: AI_PROCESSING_STATUS.PENDING,
    aiJobId: jobId,
    aiError: "",
    aiRequestedAt: new Date(),
    aiCompletedAt: null,
  });

  await markAiStatus(seriesId, { aiProcessingStatus: AI_PROCESSING_STATUS.PROCESSING });

  const { ok, status, data } = await postAnalyzeJob(payload);

  if (status === 200 && data?.status === "completed" && Array.isArray(data?.episodes)) {
    return applyProductCueResults(seriesId, {
      jobId,
      seriesId: String(seriesId),
      status: "completed",
      episodes: data.episodes,
    });
  }

  if (status === 202 || (ok && data?.status === "processing")) {
    return { seriesId, aiProcessingStatus: AI_PROCESSING_STATUS.PROCESSING, jobId };
  }

  const errMsg =
    data?.error || data?.message || `AI service returned HTTP ${status}`;
  await markAiStatus(seriesId, {
    aiProcessingStatus: AI_PROCESSING_STATUS.FAILED,
    aiError: String(errMsg).slice(0, 2000),
    aiCompletedAt: new Date(),
  });
  throw httpError(502, errMsg);
};

const requestSeriesAiAnalysis = async (userId, seriesId) => {
  const series = await findSeriesById(seriesId);
  if (!series) {
    throw httpError(404, "Series not found");
  }
  if (String(series.user) !== String(userId)) {
    throw httpError(403, "Forbidden");
  }
  validateSeriesForIngest(series);
  return queueSeriesAiAnalysis(seriesId);
};

module.exports = {
  isIngestConfigured,
  buildAnalyzePayload,
  buildEpisodeAnalyzeEntry,
  buildProductAnalyzeEntry,
  normalizeAiCallbackBody,
  applyProductCueResults,
  queueSeriesAiAnalysis,
  requestSeriesAiAnalysis,
};
