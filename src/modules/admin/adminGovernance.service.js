const mongoose = require("mongoose");
const {
  countUsers,
  adminListUsers,
  findUserById,
  updateUserById,
} = require("../user/user.repository");
const {
  findSeriesById,
  adminListSeries,
  aggregateSeriesStatusCounts,
  aggregateTotalEpisodes,
  updateSeriesById,
  updateEpisodeFieldsBySubdocId,
} = require("../series/series.repository");
const Series = require("../series/series.model");
const User = require("../user/user.model");
const {
  countEventsInRange,
  analyticsOverview,
  topSeriesByMetric,
  seriesAnalyticsDetail,
  sampleEvents,
} = require("../analytics/analytics.service");
const { appendAudit, listAudits } = require("../audit/audit.service");
const { pingS3Bucket } = require("../../common/services/s3.service");
const env = require("../../config/env");

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const parsePageLimit = (query, defLimit = 20, maxLimit = 100) => {
  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = defLimit;
  if (limit > maxLimit) limit = maxLimit;
  let page = parseInt(query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  return { limit, page, skip: (page - 1) * limit };
};

const maskPhone = (phone) => {
  const s = String(phone || "");
  if (s.length <= 4) return "****";
  return `${s.slice(0, 2)}${"*".repeat(Math.max(2, s.length - 6))}${s.slice(-4)}`;
};

const assertAdminOid = (id, label = "id") => {
  if (!id || !mongoose.isValidObjectId(String(id))) {
    throw httpError(400, `Invalid ${label}`);
  }
};

const getDashboardSummary = async () => {
  const [userCount, statusAgg, epAgg, h24, d7] = await Promise.all([
    countUsers(),
    aggregateSeriesStatusCounts(),
    aggregateTotalEpisodes(),
    countEventsInRange(new Date(Date.now() - 864e5), new Date()),
    countEventsInRange(new Date(Date.now() - 7 * 864e5), new Date()),
  ]);

  const seriesByStatus = {};
  statusAgg.forEach((row) => {
    seriesByStatus[row._id || "unknown"] = row.count;
  });
  const totalEpisodes = epAgg[0]?.total ?? 0;

  return {
    users: { total: userCount },
    series: {
      byStatus: seriesByStatus,
      total: Object.values(seriesByStatus).reduce((a, b) => a + b, 0),
    },
    episodes: { total: totalEpisodes },
    analyticsEvents: { last24h: h24, last7d: d7 },
  };
};

const getHealthDeps = async () => {
  const mongoOk = mongoose.connection.readyState === 1;
  const s3 = await pingS3Bucket();
  return {
    mongo: { ok: mongoOk },
    s3: {
      configured: Boolean(env.awsS3Bucket && env.awsRegion && env.awsAccessKeyId && env.awsSecretAccessKey),
      ...s3,
    },
    env: {
      nodeEnv: process.env.NODE_ENV || "development",
      hasJwtSecret: Boolean(env.jwtSecret),
    },
  };
};

const listSeriesAdmin = async (query) => {
  const { limit, page, skip } = parsePageLimit(query);
  const sort = query.sort || "-updatedAt";
  const [items, total] = await adminListSeries({
    status: query.status || undefined,
    genreId: query.genreId || undefined,
    userId: query.userId || undefined,
    q: query.q,
    from: query.from,
    to: query.to,
    sort,
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

const getSeriesDetailAdmin = async (seriesId) => {
  assertAdminOid(seriesId, "seriesId");
  const series = await findSeriesById(seriesId).select("-__v").lean();
  if (!series) {
    throw httpError(404, "Series not found");
  }
  const creator = await findUserById(series.user);
  const creatorSummary = creator
    ? {
        id: creator._id,
        name: creator.name || "",
        phoneMasked: maskPhone(creator.phone),
        email: creator.email || "",
      }
    : null;
  return { series, creator: creatorSummary };
};

const patchSeriesAdmin = async (adminId, seriesId, body = {}) => {
  assertAdminOid(seriesId, "seriesId");
  const updates = {};
  if (body.status != null) {
    const s = String(body.status).trim();
    if (!["draft", "submitted"].includes(s)) {
      throw httpError(400, "Invalid status");
    }
    updates.status = s;
  }
  if (body.moderationNotes != null) {
    updates.moderationNotes = String(body.moderationNotes).trim().slice(0, 4000);
  }
  if (body.featured != null) {
    updates.featured = Boolean(body.featured);
  }
  if (body.catalogHidden != null) {
    updates.catalogHidden = Boolean(body.catalogHidden);
  }
  if (!Object.keys(updates).length) {
    throw httpError(400, "Nothing to update");
  }
  const updated = await updateSeriesById(seriesId, updates);
  if (!updated) {
    throw httpError(404, "Series not found");
  }
  await appendAudit({
    actorAdminId: adminId,
    action: "series.patch",
    targetType: "series",
    targetId: String(seriesId),
    details: updates,
  });
  return updated;
};

const postSeriesActionAdmin = async (adminId, seriesId, body = {}) => {
  assertAdminOid(seriesId, "seriesId");
  const action = String(body.action || "").trim();
  const reason = body.reason != null ? String(body.reason).trim().slice(0, 500) : "";
  const notes = body.notes != null ? String(body.notes).trim().slice(0, 2000) : "";

  let updates = {};
  if (action === "unpublish") {
    updates = { status: "draft" };
  } else if (action === "restore") {
    updates = { status: "submitted", catalogHidden: false };
  } else if (action === "flag") {
    const piece = [reason, notes].filter(Boolean).join(" — ");
    const prev = await findSeriesById(seriesId).select("moderationNotes").lean();
    const merged = [piece, prev?.moderationNotes || ""].filter(Boolean).join("\n").slice(0, 4000);
    updates = { moderationNotes: merged };
  } else {
    throw httpError(400, "Invalid action (use unpublish, restore, flag)");
  }

  const updated = await updateSeriesById(seriesId, updates);
  if (!updated) {
    throw httpError(404, "Series not found");
  }
  await appendAudit({
    actorAdminId: adminId,
    action: `series.action.${action}`,
    targetType: "series",
    targetId: String(seriesId),
    details: { reason, notes, updates },
  });
  return updated;
};

const listEpisodesAdmin = async (seriesId) => {
  assertAdminOid(seriesId, "seriesId");
  const series = await findSeriesById(seriesId).select("episodes name").lean();
  if (!series) {
    throw httpError(404, "Series not found");
  }
  const episodes = (series.episodes || []).map((ep) => ({
    _id: ep._id,
    order: ep.order,
    title: ep.title,
    videoUrl: ep.videoUrl,
    cueCount: Array.isArray(ep.productCues) ? ep.productCues.length : 0,
    adminDisabled: Boolean(ep.adminDisabled),
  }));
  return { seriesId: String(seriesId), seriesName: series.name, episodes };
};

const patchEpisodeAdmin = async (adminId, seriesId, episodeId, body = {}) => {
  assertAdminOid(seriesId, "seriesId");
  assertAdminOid(episodeId, "episodeId");
  const fields = {};
  if (body.adminDisabled != null) {
    fields.adminDisabled = Boolean(body.adminDisabled);
  }
  if (body.productCues !== undefined) {
    if (!Array.isArray(body.productCues)) {
      throw httpError(400, "productCues must be an array");
    }
    fields.productCues = body.productCues;
  }
  if (!Object.keys(fields).length) {
    throw httpError(400, "Nothing to update");
  }
  const updated = await updateEpisodeFieldsBySubdocId(seriesId, episodeId, fields);
  if (!updated) {
    throw httpError(404, "Series or episode not found");
  }
  await appendAudit({
    actorAdminId: adminId,
    action: "episode.patch",
    targetType: "episode",
    targetId: `${seriesId}:${episodeId}`,
    details: fields,
  });
  return updated;
};

const listUsersAdmin = async (query) => {
  const { limit, page, skip } = parsePageLimit(query);
  const filter = {};
  if (query.isActive !== undefined && query.isActive !== "") {
    filter.isActive = String(query.isActive).toLowerCase() === "true";
  }
  if (query.phone !== undefined && String(query.phone).trim()) {
    filter.phone = new RegExp(escapeRegex(String(query.phone).trim()), "i");
  }
  if (query.q !== undefined && String(query.q).trim()) {
    const term = escapeRegex(String(query.q).trim());
    const regex = new RegExp(term, "i");
    filter.$or = [{ name: regex }, { username: regex }, { email: regex }, { phone: regex }];
  }
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  const [items, total] = await adminListUsers({
    filter,
    sortObj: { createdAt: -1 },
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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const getUserDetailAdmin = async (userId) => {
  assertAdminOid(userId, "userId");
  const user = await findUserById(userId);
  if (!user) {
    throw httpError(404, "User not found");
  }
  const [seriesCount, favLean] = await Promise.all([
    Series.countDocuments({ user: userId }),
    User.findById(userId).select("favoriteSeries").lean(),
  ]);
  const favoritesCount = Array.isArray(favLean?.favoriteSeries) ? favLean.favoriteSeries.length : 0;

  return {
    user,
    counts: { series: seriesCount, favorites: favoritesCount },
  };
};

const patchUserAdmin = async (adminId, userId, body = {}) => {
  assertAdminOid(userId, "userId");
  if (body.isActive === undefined) {
    throw httpError(400, "isActive is required");
  }
  const isActive = Boolean(body.isActive);
  const updated = await updateUserById(userId, { isActive });
  if (!updated) {
    throw httpError(404, "User not found");
  }
  await appendAudit({
    actorAdminId: adminId,
    action: "user.patch",
    targetType: "user",
    targetId: String(userId),
    details: { isActive },
  });
  return updated;
};

const getAnalyticsOverviewAdmin = (query) =>
  analyticsOverview({
    from: query.from,
    to: query.to,
    granularity: query.granularity === "week" ? "week" : "day",
  });

const getAnalyticsSeriesTopAdmin = async (query) => {
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
  const rows = await topSeriesByMetric({
    from: query.from,
    to: query.to,
    genreId: query.genreId,
    metric: query.metric || "episode.play.start",
    limit,
  });
  const ids = rows.map((r) => r._id).filter(Boolean);
  const docs = await Series.find({ _id: { $in: ids } })
    .select("name genreName status")
    .lean();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  return rows.map((r) => ({
    seriesId: String(r._id),
    count: r.count,
    name: byId.get(String(r._id))?.name || "",
    genreName: byId.get(String(r._id))?.genreName || "",
    status: byId.get(String(r._id))?.status || "",
  }));
};

const getAnalyticsSeriesDetailAdmin = (seriesId, query) =>
  seriesAnalyticsDetail(seriesId, query.from, query.to);

const getEpisodeAnalyticsTableAdmin = async (seriesId, query) => {
  assertAdminOid(seriesId, "seriesId");
  const detail = await seriesAnalyticsDetail(seriesId, query.from, query.to);
  const series = await findSeriesById(seriesId).select("episodes").lean();
  if (!series) {
    throw httpError(404, "Series not found");
  }

  const counts = new Map();
  for (const row of detail.byEpisodeRaw || []) {
    const eid = String(row._id.episodeId);
    const t = row._id.eventType;
    if (!counts.has(eid)) {
      counts.set(eid, {});
    }
    counts.get(eid)[t] = row.count;
  }

  const episodes = (series.episodes || []).map((ep) => {
    const id = String(ep._id);
    const m = counts.get(id) || {};
    return {
      episodeId: id,
      order: ep.order,
      title: ep.title,
      adminDisabled: Boolean(ep.adminDisabled),
      cueCount: Array.isArray(ep.productCues) ? ep.productCues.length : 0,
      metrics: {
        playStarts: m["episode.play.start"] || 0,
        playCompletes: m["episode.play.complete"] || 0,
        productCueClicks: m["product_cue.click"] || 0,
      },
    };
  });

  return {
    seriesId: String(seriesId),
    rollup: {
      byType: detail.byType,
      episodePlayStarts: detail.episodePlayStarts,
      episodePlayCompletes: detail.episodePlayCompletes,
    },
    episodes,
  };
};

const getSampleEventsAdmin = async (query) =>
  sampleEvents(parseInt(query.limit, 10) || 50);

const getAuditLogAdmin = async (query) => {
  const { limit, page, skip } = parsePageLimit(query, 50, 200);
  const actorAdminId = query.actorAdminId && mongoose.isValidObjectId(query.actorAdminId)
    ? query.actorAdminId
    : undefined;
  const { items, total } = await listAudits({
    actorAdminId,
    targetType: query.targetType,
    targetId: query.targetId,
    from: query.from,
    to: query.to,
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

module.exports = {
  getDashboardSummary,
  getHealthDeps,
  listSeriesAdmin,
  getSeriesDetailAdmin,
  patchSeriesAdmin,
  postSeriesActionAdmin,
  listEpisodesAdmin,
  patchEpisodeAdmin,
  listUsersAdmin,
  getUserDetailAdmin,
  patchUserAdmin,
  getAnalyticsOverviewAdmin,
  getAnalyticsSeriesTopAdmin,
  getAnalyticsSeriesDetailAdmin,
  getEpisodeAnalyticsTableAdmin,
  getSampleEventsAdmin,
  getAuditLogAdmin,
};
