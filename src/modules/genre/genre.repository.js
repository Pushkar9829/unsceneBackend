const Genre = require("./genre.model");

const createGenre = (payload) => Genre.create(payload);

const findGenreById = (id) => Genre.findById(id);

const findGenreByNormalizedName = (normalizedName) => Genre.findOne({ normalizedName });

const listGenres = ({ isActive } = {}) => {
  const filter = {};
  if (typeof isActive === "boolean") {
    filter.isActive = isActive;
  }
  return Genre.find(filter).sort({ name: 1 }).select("-__v").lean();
};

const updateGenreById = (id, update) =>
  Genre.findByIdAndUpdate(id, update, { new: true, runValidators: true }).select("-__v").lean();

const deleteGenreById = (id) => Genre.findByIdAndDelete(id).lean();

module.exports = {
  createGenre,
  findGenreById,
  findGenreByNormalizedName,
  listGenres,
  updateGenreById,
  deleteGenreById,
};
