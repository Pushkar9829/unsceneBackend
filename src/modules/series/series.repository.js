const Series = require("./series.model");

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createSeries = (payload) => Series.create(payload);

const findSeriesById = (id) => Series.findById(id);

const findSeriesByUser = (userId) =>
  Series.find({ user: userId }).sort({ updatedAt: -1 }).select("-__v").lean();

const findSeriesCatalog = ({ q, status, genreId, skip, limit }) => {
  const filter = {};
  if (status) {
    filter.status = status;
    if (status === "submitted") {
      filter.catalogHidden = { $ne: true };
    }
  }
  if (genreId) {
    filter.genreId = genreId;
  }
  if (q !== undefined && q !== null && String(q).trim() !== "") {
    const term = escapeRegex(String(q).trim());
    const regex = new RegExp(term, "i");
    filter.$or = [{ type: regex }, { name: regex }];
  }

  return Promise.all([
    Series.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).select("-__v").lean(),
    Series.countDocuments(filter),
  ]);
};

const adminListSeries = ({
  status,
  genreId,
  userId,
  q,
  from,
  to,
  sort = "-updatedAt",
  skip,
  limit,
}) => {
  const filter = {};
  if (status) filter.status = status;
  if (genreId) filter.genreId = genreId;
  if (userId) filter.user = userId;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  if (q !== undefined && q !== null && String(q).trim() !== "") {
    const term = escapeRegex(String(q).trim());
    const regex = new RegExp(term, "i");
    filter.$or = [{ type: regex }, { name: regex }];
  }

  let sortObj = { updatedAt: -1 };
  if (sort === "updatedAt" || sort === "-updatedAt") {
    sortObj = sort.startsWith("-") ? { updatedAt: -1 } : { updatedAt: 1 };
  } else if (sort === "createdAt" || sort === "-createdAt") {
    sortObj = sort.startsWith("-") ? { createdAt: -1 } : { createdAt: 1 };
  }

  return Promise.all([
    Series.find(filter).sort(sortObj).skip(skip).limit(limit).select("-__v").lean(),
    Series.countDocuments(filter),
  ]);
};

const aggregateSeriesStatusCounts = () =>
  Series.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

const aggregateTotalEpisodes = () =>
  Series.aggregate([
    { $project: { n: { $size: { $ifNull: ["$episodes", []] } } } },
    { $group: { _id: null, total: { $sum: "$n" } } },
  ]);

const updateSeriesById = (id, update) =>
  Series.findByIdAndUpdate(id, update, { new: true, runValidators: true }).select("-__v");

const addEpisodeToSeries = (id, episode) =>
  Series.findByIdAndUpdate(id, { $push: { episodes: episode } }, { new: true, runValidators: true }).select(
    "-__v"
  );

const addProductToSeries = (id, product) =>
  Series.findByIdAndUpdate(id, { $push: { products: product } }, { new: true, runValidators: true }).select(
    "-__v"
  );

/** Patch fields on one episode subdocument (matched by episodes._id). */
const updateEpisodeFieldsBySubdocId = (seriesId, episodeSubdocId, fields) => {
  const $set = {};
  for (const [key, value] of Object.entries(fields)) {
    $set[`episodes.$.${key}`] = value;
  }
  return Series.findOneAndUpdate(
    { _id: seriesId, "episodes._id": episodeSubdocId },
    { $set },
    { new: true, runValidators: true }
  ).select("-__v");
};

module.exports = {
  createSeries,
  findSeriesById,
  findSeriesByUser,
  findSeriesCatalog,
  adminListSeries,
  aggregateSeriesStatusCounts,
  aggregateTotalEpisodes,
  updateSeriesById,
  addEpisodeToSeries,
  addProductToSeries,
  updateEpisodeFieldsBySubdocId,
};
