const path = require("path");
const mongoose = require("mongoose");
const {
  findUserById,
  updateUserById,
  findFavoriteSeriesIds,
  addFavoriteSeriesId,
  removeFavoriteSeriesId,
  deleteUserById,
} = require("./user.repository");
const {
  getPresignedUploadUrl,
  getPublicFileUrl,
  deleteObjectByKey,
} = require("../../common/services/s3.service");
const { findSeriesById, findSeriesByUser, deleteAllSeriesByUser } = require("../series/series.repository");
const Series = require("../series/series.model");
const { recordAnalyticsEvent } = require("../analytics/analytics.service");
const otpService = require("../../common/services/otpService");
const { deleteAllByUser: deleteWatchProgressByUser, deleteAllBySeriesIds: deleteWatchProgressBySeriesIds } = require("../watchProgress/watchProgress.repository");
const { deleteAllByUser: deleteNotificationsByUser } = require("../notification/notification.repository");
const AnalyticsEvent = require("../analytics/analyticsEvent.model");

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const assertSeriesId = (seriesId) => {
  if (!seriesId || !String(seriesId).trim()) {
    throw httpError(400, "seriesId is required");
  }
  if (!mongoose.isValidObjectId(String(seriesId).trim())) {
    throw httpError(400, "Invalid seriesId");
  }
};

const assertFavoritableSeries = async (seriesId) => {
  const doc = await findSeriesById(seriesId).select("status catalogHidden").lean();
  if (!doc) {
    throw httpError(404, "Series not found");
  }
  if (doc.status !== "submitted") {
    throw httpError(400, "Only published series can be favorited");
  }
  if (doc.catalogHidden) {
    throw httpError(400, "Series is not available");
  }
};

const getUserProfile = async (id) => {
  const user = await findUserById(id);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
};

const ALLOWED_PATCH_FIELDS = ["name", "username", "bio", "email", "dateOfBirth"];

const updateUserProfile = async (id, body = {}) => {
  const updates = {};
  let touched = 0;
  for (const key of ALLOWED_PATCH_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) {
      continue;
    }
    touched += 1;
    const raw = body[key];
    if (raw === null) {
      updates[key] = null;
    } else if (typeof raw === "string") {
      updates[key] = raw.trim();
    } else {
      throw new Error(`Invalid ${key}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "profileImageKey")) {
    touched += 1;
    const key = body.profileImageKey;
    if (typeof key !== "string" || !key.trim()) {
      throw new Error("Invalid profileImageKey");
    }
    updates.profileImageKey = key.trim();
    updates.profileImageUrl = getPublicFileUrl(updates.profileImageKey);
  }

  if (!touched) {
    throw new Error("Nothing to update");
  }

  const user = await updateUserById(id, updates);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
};

const presignUserProfileImageUpload = async (
  id,
  { fileName, contentType = "image/jpeg" } = {}
) => {
  const user = await findUserById(id);
  if (!user) {
    throw new Error("User not found");
  }
  if (!fileName || !String(fileName).trim()) {
    throw new Error("fileName is required");
  }

  const safeName = path.basename(String(fileName).trim());
  return getPresignedUploadUrl({
    folder: `users/${id}/profile`,
    fileName: safeName,
    contentType,
    expiresInSeconds: 600,
  });
};

const FAVORITES_DEFAULT_LIMIT = 20;
const FAVORITES_MAX_LIMIT = 100;

const addSeriesToFavorites = async (userId, seriesIdRaw) => {
  assertSeriesId(seriesIdRaw);
  const seriesId = new mongoose.Types.ObjectId(String(seriesIdRaw).trim());
  await assertFavoritableSeries(seriesId);
  const user = await addFavoriteSeriesId(userId, seriesId);
  if (!user) {
    throw httpError(404, "User not found");
  }
  recordAnalyticsEvent({
    eventType: "series.favorite.add",
    seriesId: String(seriesId),
    userId: String(userId),
  });
  return { favorited: true, seriesId: String(seriesId) };
};

const removeSeriesFromFavorites = async (userId, seriesIdRaw) => {
  assertSeriesId(seriesIdRaw);
  const seriesId = new mongoose.Types.ObjectId(String(seriesIdRaw).trim());
  const user = await removeFavoriteSeriesId(userId, seriesId);
  if (!user) {
    throw httpError(404, "User not found");
  }
  recordAnalyticsEvent({
    eventType: "series.favorite.remove",
    seriesId: String(seriesId),
    userId: String(userId),
  });
  return { favorited: false, seriesId: String(seriesId) };
};

const listFavoriteSeries = async (userId, query = {}) => {
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) {
    limit = FAVORITES_DEFAULT_LIMIT;
  }
  if (limit > FAVORITES_MAX_LIMIT) {
    limit = FAVORITES_MAX_LIMIT;
  }
  let page = parseInt(query.page, 10);
  if (!Number.isFinite(page) || page < 1) {
    page = 1;
  }

  const doc = await findFavoriteSeriesIds(userId);
  if (!doc) {
    throw httpError(404, "User not found");
  }
  const allIds = doc.favoriteSeries || [];
  const total = allIds.length;
  const skip = (page - 1) * limit;
  const pageIds = allIds.slice(skip, skip + limit);

  if (!pageIds.length) {
    return {
      items: [],
      total,
      page,
      limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  const found = await Series.find({
    _id: { $in: pageIds },
    status: "submitted",
    catalogHidden: { $ne: true },
  })
    .select("-__v")
    .lean();

  const byId = new Map(found.map((s) => [String(s._id), s]));
  const items = pageIds
    .map((id) => byId.get(String(id)))
    .filter(Boolean);

  return {
    items,
    total,
    page,
    limit,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
};

const collectS3KeysFromSeries = (series) => {
  const keys = new Set();
  const add = (key) => {
    if (typeof key === "string" && key.trim()) {
      keys.add(key.trim());
    }
  };
  add(series.thumbnailKey);
  for (const ep of series.episodes || []) {
    add(ep.videoKey);
    add(ep.timestampJsonKey);
    for (const cue of ep.productCues || []) {
      add(cue.imageKey);
    }
  }
  for (const product of series.products || []) {
    add(product.imageKey);
  }
  return [...keys];
};

const deleteS3KeysBestEffort = async (keys) => {
  const unique = [...new Set(keys.filter(Boolean))];
  for (const key of unique) {
    try {
      await deleteObjectByKey(key);
    } catch (err) {
      console.warn("[USER][DELETE_ACCOUNT] S3 delete failed", { key, error: err.message });
    }
  }
};

const sendDeleteAccountOtp = async (userId) => {
  const user = await findUserById(userId);
  if (!user) {
    throw httpError(404, "User not found");
  }
  if (!user.isActive) {
    throw httpError(400, "Account is not active");
  }
  await otpService.createAndSendOtp(user.phone);
};

const deleteUserAccount = async (userId, { otp } = {}) => {
  const otpStr = String(otp || "").trim();
  if (!otpStr) {
    throw httpError(400, "Invalid or expired OTP");
  }

  const user = await findUserById(userId);
  if (!user) {
    throw httpError(404, "User not found");
  }
  if (!user.isActive) {
    throw httpError(400, "Account is not active");
  }
  if (!otpService.verifyOtp(user.phone, otpStr)) {
    throw httpError(400, "Invalid or expired OTP");
  }

  const seriesList = await findSeriesByUser(userId);
  const seriesIds = seriesList.map((s) => s._id);

  const s3Keys = [];
  if (user.profileImageKey) {
    s3Keys.push(user.profileImageKey);
  }
  for (const series of seriesList) {
    s3Keys.push(...collectS3KeysFromSeries(series));
  }
  await deleteS3KeysBestEffort(s3Keys);

  await Promise.all([
    deleteWatchProgressByUser(userId),
    deleteWatchProgressBySeriesIds(seriesIds),
    deleteNotificationsByUser(userId),
    AnalyticsEvent.deleteMany({ userId }),
    deleteAllSeriesByUser(userId),
  ]);

  const deleted = await deleteUserById(userId);
  if (!deleted) {
    throw httpError(404, "User not found");
  }

  return { deleted: true };
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  presignUserProfileImageUpload,
  addSeriesToFavorites,
  removeSeriesFromFavorites,
  listFavoriteSeries,
  sendDeleteAccountOtp,
  deleteUserAccount,
};
