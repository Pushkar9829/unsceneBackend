const WatchProgress = require("./watchProgress.model");

const upsertByUserSeries = (userId, seriesId, fields) =>
  WatchProgress.findOneAndUpdate(
    { userId, seriesId },
    { $set: { userId, seriesId, ...fields } },
    { new: true, upsert: true, runValidators: true }
  )
    .select("-__v")
    .lean();

const findByUserAndSeries = (userId, seriesId) =>
  WatchProgress.findOne({ userId, seriesId }).select("-__v").lean();

const listByUser = (userId, { skip = 0, limit = 50 }) =>
  WatchProgress.find({ userId }).sort({ updatedAt: -1 }).skip(skip).limit(limit).select("-__v").lean();

const deleteByUserAndSeries = (userId, seriesId) => WatchProgress.deleteOne({ userId, seriesId });

const deleteAllByUser = (userId) => WatchProgress.deleteMany({ userId });

const deleteAllBySeriesIds = (seriesIds) => {
  if (!seriesIds?.length) {
    return Promise.resolve({ deletedCount: 0 });
  }
  return WatchProgress.deleteMany({ seriesId: { $in: seriesIds } });
};

module.exports = {
  upsertByUserSeries,
  findByUserAndSeries,
  listByUser,
  deleteByUserAndSeries,
  deleteAllByUser,
  deleteAllBySeriesIds,
};
