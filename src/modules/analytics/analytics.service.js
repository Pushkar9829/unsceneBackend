const mongoose = require("mongoose");
const AnalyticsEvent = require("./analyticsEvent.model");
const { ANALYTICS_EVENT_TYPES } = require("./analytics.constants");

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const assertOid = (id, label) => {
  if (!id || !mongoose.isValidObjectId(String(id))) {
    throw httpError(400, `Invalid ${label}`);
  }
};

const MAX_BATCH = 50;

const normalizeIncomingEvent = (raw, reqUser) => {
  if (!raw || typeof raw !== "object") {
    throw httpError(400, "Each event must be an object");
  }
  const eventType = raw.eventType != null ? String(raw.eventType).trim() : "";
  if (!eventType || !ANALYTICS_EVENT_TYPES.includes(eventType)) {
    throw httpError(400, `Invalid or unsupported eventType: ${eventType || "(empty)"}`);
  }

  let seriesId;
  if (raw.seriesId != null && raw.seriesId !== "") {
    assertOid(raw.seriesId, "seriesId");
    seriesId = new mongoose.Types.ObjectId(String(raw.seriesId));
  }

  let episodeId;
  if (raw.episodeId != null && raw.episodeId !== "") {
    assertOid(raw.episodeId, "episodeId");
    episodeId = new mongoose.Types.ObjectId(String(raw.episodeId));
  }

  let userId;
  if (reqUser?.id) {
    userId = new mongoose.Types.ObjectId(String(reqUser.id));
  }
  if (raw.userId != null && raw.userId !== "") {
    assertOid(raw.userId, "userId");
    userId = new mongoose.Types.ObjectId(String(raw.userId));
  }

  const sessionId = raw.sessionId != null ? String(raw.sessionId).trim().slice(0, 128) : "";
  const deviceId = raw.deviceId != null ? String(raw.deviceId).trim().slice(0, 128) : "";
  if (!userId && !sessionId && !deviceId) {
    throw httpError(400, "Provide sessionId or deviceId for anonymous events (or authenticate)");
  }

  const eventId = raw.eventId != null ? String(raw.eventId).trim().slice(0, 128) : undefined;
  const platform = raw.platform != null ? String(raw.platform).trim().slice(0, 64) : "";
  const clientVersion = raw.clientVersion != null ? String(raw.clientVersion).trim().slice(0, 64) : "";

  let occurredAt = new Date();
  if (raw.occurredAt != null && raw.occurredAt !== "") {
    const d = new Date(raw.occurredAt);
    if (!Number.isNaN(d.getTime())) {
      occurredAt = d;
    }
  }

  const payload = {};
  if (raw.watchPercent != null && Number.isFinite(Number(raw.watchPercent))) {
    payload.watchPercent = Number(raw.watchPercent);
  }
  if (raw.durationSeconds != null && Number.isFinite(Number(raw.durationSeconds))) {
    payload.durationSeconds = Number(raw.durationSeconds);
  }
  if (raw.metadata != null && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)) {
    Object.assign(payload, raw.metadata);
  }

  const doc = {
    eventType,
    seriesId,
    episodeId,
    userId,
    sessionId: sessionId || undefined,
    deviceId: deviceId || undefined,
    platform: platform || undefined,
    clientVersion: clientVersion || undefined,
    payload,
    occurredAt,
  };
  if (eventId) {
    doc.eventId = eventId;
  }
  return doc;
};

const ingestAnalyticsEvents = async (body, reqUser) => {
  let list = body?.events;
  if (!Array.isArray(list)) {
    if (body && typeof body === "object" && body.eventType) {
      list = [body];
    } else {
      throw httpError(400, "Send { events: [...] } or one event object with eventType");
    }
  }
  if (!list.length) {
    throw httpError(400, "events array required or send a single event object");
  }
  if (list.length > MAX_BATCH) {
    throw httpError(400, `At most ${MAX_BATCH} events per request`);
  }

  const docs = list.map((item) => normalizeIncomingEvent(item, reqUser));

  let inserted = 0;
  let duplicates = 0;
  for (const doc of docs) {
    try {
      await AnalyticsEvent.create(doc);
      inserted += 1;
    } catch (e) {
      if (e?.code === 11000 && doc.eventId) {
        duplicates += 1;
      } else {
        throw e;
      }
    }
  }

  return { accepted: list.length, inserted, duplicatesSkipped: duplicates };
};

/** Internal server-side recording (e.g. favorites mirror). */
const recordAnalyticsEvent = async (partial) => {
  const doc = normalizeIncomingEvent(
    {
      ...partial,
      sessionId: partial.sessionId || `srv:${partial.eventType}:${Date.now()}`,
    },
    partial.userId ? { id: partial.userId } : null
  );
  try {
    await AnalyticsEvent.create(doc);
  } catch (e) {
    if (e?.code !== 11000) {
      console.warn("[analytics] recordAnalyticsEvent failed", e.message);
    }
  }
};

const countEventsInRange = (from, to, extraFilter = {}) => {
  const filter = { ...extraFilter };
  filter.createdAt = {};
  if (from) filter.createdAt.$gte = new Date(from);
  if (to) filter.createdAt.$lte = new Date(to);
  return AnalyticsEvent.countDocuments(filter);
};

const distinctActorsInRange = async (from, to) => {
  const match = {};
  match.createdAt = {};
  if (from) match.createdAt.$gte = new Date(from);
  if (to) match.createdAt.$lte = new Date(to);
  const userIds = await AnalyticsEvent.distinct("userId", { ...match, userId: { $exists: true, $ne: null } });
  const sessions = await AnalyticsEvent.distinct("sessionId", {
    ...match,
    sessionId: { $exists: true, $ne: "" },
  });
  return { distinctUserIds: userIds.filter(Boolean).length, distinctSessionIds: sessions.filter(Boolean).length };
};

const aggregateByType = async (from, to) => {
  const match = {};
  match.createdAt = {};
  if (from) match.createdAt.$gte = new Date(from);
  if (to) match.createdAt.$lte = new Date(to);
  return AnalyticsEvent.aggregate([
    { $match: match },
    { $group: { _id: "$eventType", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
};

const topSeriesByMetric = async ({ from, to, genreId, metric = "episode.play.start", limit = 10 }) => {
  const match = { eventType: metric };
  match.createdAt = {};
  if (from) match.createdAt.$gte = new Date(from);
  if (to) match.createdAt.$lte = new Date(to);
  const pipeline = [{ $match: match }, { $match: { seriesId: { $exists: true, $ne: null } } }];
  if (genreId && mongoose.isValidObjectId(String(genreId))) {
    const Series = require("../series/series.model");
    const ids = await Series.find({
      genreId: new mongoose.Types.ObjectId(String(genreId)),
    })
      .distinct("_id")
      .lean();
    pipeline.push({ $match: { seriesId: { $in: ids } } });
  }
  pipeline.push(
    { $group: { _id: "$seriesId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit }
  );
  return AnalyticsEvent.aggregate(pipeline);
};

const seriesAnalyticsDetail = async (seriesId, from, to) => {
  assertOid(seriesId, "seriesId");
  const sid = new mongoose.Types.ObjectId(String(seriesId));
  const match = { seriesId: sid };
  match.createdAt = {};
  if (from) match.createdAt.$gte = new Date(from);
  if (to) match.createdAt.$lte = new Date(to);

  const [byType, episodeStarts, episodeCompletes] = await Promise.all([
    AnalyticsEvent.aggregate([
      { $match: match },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
    ]),
    AnalyticsEvent.countDocuments({ ...match, eventType: "episode.play.start" }),
    AnalyticsEvent.countDocuments({ ...match, eventType: "episode.play.complete" }),
  ]);

  const byEpisode = await AnalyticsEvent.aggregate([
    {
      $match: {
        ...match,
        episodeId: { $exists: true, $ne: null },
        eventType: { $in: ["episode.play.start", "episode.play.complete", "product_cue.click"] },
      },
    },
    {
      $group: {
        _id: { episodeId: "$episodeId", eventType: "$eventType" },
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    seriesId: String(sid),
    byType,
    episodePlayStarts: episodeStarts,
    episodePlayCompletes: episodeCompletes,
    byEpisodeRaw: byEpisode,
  };
};

const sampleEvents = async (limit = 50) => {
  const items = await AnalyticsEvent.find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(1, limit)))
    .select({
      eventType: 1,
      seriesId: 1,
      episodeId: 1,
      occurredAt: 1,
      createdAt: 1,
      platform: 1,
      clientVersion: 1,
      payload: 1,
    })
    .lean();
  return items.map((row) => {
    const { userId: _u, sessionId: _s, deviceId: _d, ...rest } = row;
    return {
      ...rest,
      payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    };
  });
};

const creatorSeriesStatsSummary = async (seriesId, ownerUserId) => {
  assertOid(seriesId, "seriesId");
  assertOid(ownerUserId, "userId");
  const sid = new mongoose.Types.ObjectId(String(seriesId));
  const Series = require("../series/series.model");
  const series = await Series.findById(sid).select("user").lean();
  if (!series) {
    throw httpError(404, "Series not found");
  }
  if (String(series.user) !== String(ownerUserId)) {
    throw httpError(403, "Not allowed");
  }

  const match = { seriesId: sid };
  const [byType, views, starts, completes, cueClicks] = await Promise.all([
    AnalyticsEvent.aggregate([
      { $match: match },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
    ]),
    AnalyticsEvent.countDocuments({ ...match, eventType: "series.view" }),
    AnalyticsEvent.countDocuments({ ...match, eventType: "episode.play.start" }),
    AnalyticsEvent.countDocuments({ ...match, eventType: "episode.play.complete" }),
    AnalyticsEvent.countDocuments({ ...match, eventType: "product_cue.click" }),
  ]);

  return {
    seriesId: String(sid),
    totals: {
      byType,
      seriesViews: views,
      episodePlayStarts: starts,
      episodePlayCompletes: completes,
      productCueClicks: cueClicks,
    },
  };
};

const analyticsOverview = async ({ from, to, granularity }) => {
  const [byType, actors, totalEvents] = await Promise.all([
    aggregateByType(from, to),
    distinctActorsInRange(from, to),
    countEventsInRange(from, to),
  ]);

  const buckets = [];
  const gf = from ? new Date(from) : new Date(Date.now() - 30 * 864e5);
  const gt = to ? new Date(to) : new Date();
  const maxBuckets = 120;
  let bucketCount = 0;
  if (granularity === "week") {
    let cursor = new Date(gf);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor <= gt && bucketCount < maxBuckets) {
      bucketCount += 1;
      const next = new Date(cursor);
      next.setUTCDate(next.getUTCDate() + 7);
      const count = await countEventsInRange(cursor, next);
      buckets.push({ periodStart: cursor.toISOString(), eventCount: count });
      cursor = next;
    }
  } else {
    let cursor = new Date(gf);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(gt);
    end.setUTCHours(23, 59, 59, 999);
    while (cursor <= end && bucketCount < maxBuckets) {
      bucketCount += 1;
      const next = new Date(cursor);
      next.setUTCDate(next.getUTCDate() + 1);
      const count = await countEventsInRange(cursor, next);
      buckets.push({ periodStart: cursor.toISOString(), eventCount: count });
      cursor = next;
    }
  }

  return {
    from: gf.toISOString(),
    to: gt.toISOString(),
    granularity: granularity === "week" ? "week" : "day",
    totalEvents,
    distinctUsersWithUserId: actors.distinctUserIds,
    distinctSessions: actors.distinctSessionIds,
    byType,
    buckets,
  };
};

module.exports = {
  ingestAnalyticsEvents,
  recordAnalyticsEvent,
  countEventsInRange,
  analyticsOverview,
  topSeriesByMetric,
  seriesAnalyticsDetail,
  sampleEvents,
  creatorSeriesStatsSummary,
};
