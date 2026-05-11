const mongoose = require("mongoose");
const { findSeriesById } = require("../series/series.repository");
const {
  upsertByUserSeries,
  findByUserAndSeries,
  listByUser,
  deleteByUserAndSeries,
} = require("./watchProgress.repository");

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

/** Viewer can record progress on catalogue series or own drafts/previews. */
const assertUserMayWatchSeries = (userId, series) => {
  if (!series) {
    throw httpError(404, "Series not found");
  }
  const uid = String(userId);
  const ownerId = series.user != null ? String(series.user) : "";
  const submittedPublic = series.status === "submitted" && series.catalogHidden !== true;
  if (submittedPublic || uid === ownerId) {
    return;
  }
  throw httpError(403, "You cannot save progress for this series");
};

const findEpisodeOnSeries = (series, episodeId) => {
  const eps = Array.isArray(series.episodes) ? series.episodes : [];
  const sid = String(episodeId);
  return eps.find((e) => e && e._id != null && String(e._id) === sid) || null;
};

const clampPosition = (positionSeconds, durationSeconds) => {
  let pos = Number(positionSeconds);
  if (!Number.isFinite(pos) || pos < 0) {
    pos = 0;
  }
  const dur = durationSeconds != null && Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : null;
  if (dur != null && dur > 0 && pos > dur) {
    pos = dur;
  }
  return pos;
};

const parsePaging = (query) => {
  const page = Math.max(1, Number(query?.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query?.limit) || 50));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const upsertWatchProgress = async (userId, seriesId, body) => {
  assertOid(seriesId, "seriesId");
  const episodeRaw = body?.episodeId ?? body?.episode_id;
  assertOid(episodeRaw, "episodeId");

  const series = await findSeriesById(seriesId);
  assertUserMayWatchSeries(userId, series);

  const episodeId = new mongoose.Types.ObjectId(String(episodeRaw));
  const ep = findEpisodeOnSeries(series, episodeId);
  if (!ep) {
    throw httpError(400, "Episode does not belong to this series");
  }
  if (ep.adminDisabled === true) {
    throw httpError(400, "Episode is not available");
  }

  let positionSeconds = clampPosition(body?.positionSeconds ?? body?.position_seconds ?? 0, body?.durationSeconds);
  let durationSeconds =
    body?.durationSeconds != null && Number.isFinite(Number(body.durationSeconds))
      ? Math.max(0, Number(body.durationSeconds))
      : undefined;
  if (durationSeconds === 0) {
    durationSeconds = undefined;
  }

  positionSeconds = clampPosition(positionSeconds, durationSeconds);

  let completed = Boolean(body?.completed);
  if (durationSeconds != null && durationSeconds > 0 && positionSeconds >= durationSeconds - 1) {
    completed = true;
  }

  const doc = await upsertByUserSeries(
    new mongoose.Types.ObjectId(String(userId)),
    new mongoose.Types.ObjectId(String(seriesId)),
    {
      episodeId,
      positionSeconds,
      durationSeconds,
      completed,
    }
  );

  return doc;
};

const getWatchProgress = async (userId, seriesId) => {
  assertOid(seriesId, "seriesId");
  const series = await findSeriesById(seriesId);
  assertUserMayWatchSeries(userId, series);

  const row = await findByUserAndSeries(
    new mongoose.Types.ObjectId(String(userId)),
    new mongoose.Types.ObjectId(String(seriesId))
  );
  return row || null;
};

const listWatchProgress = async (userId, query) => {
  const { limit, skip, page } = parsePaging(query);
  const uid = new mongoose.Types.ObjectId(String(userId));
  const rows = await listByUser(uid, { skip, limit });
  return {
    items: rows,
    page,
    limit,
  };
};

const deleteWatchProgress = async (userId, seriesId) => {
  assertOid(seriesId, "seriesId");
  const series = await findSeriesById(seriesId);
  assertUserMayWatchSeries(userId, series);

  await deleteByUserAndSeries(new mongoose.Types.ObjectId(String(userId)), new mongoose.Types.ObjectId(String(seriesId)));
  return { deleted: true };
};

module.exports = {
  upsertWatchProgress,
  getWatchProgress,
  listWatchProgress,
  deleteWatchProgress,
};
