const mongoose = require("mongoose");
const {
  createGenre,
  findGenreById,
  findGenreByNormalizedName,
  listGenres,
  updateGenreById,
  deleteGenreById,
} = require("./genre.repository");

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const assertObjectId = (id, label = "id") => {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, `Invalid ${label}`);
  }
};

const normalizeName = (name) => String(name || "").trim().toLowerCase();

const validateName = (name) => {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    throw httpError(400, "name is required");
  }
  if (trimmed.length > 80) {
    throw httpError(400, "name must be at most 80 characters");
  }
  return trimmed;
};

const createGenreEntry = async ({ name, isActive = true }) => {
  const validatedName = validateName(name);
  const normalizedName = normalizeName(validatedName);
  const existing = await findGenreByNormalizedName(normalizedName);
  if (existing) {
    throw httpError(409, "Genre already exists");
  }
  const created = await createGenre({
    name: validatedName,
    normalizedName,
    isActive: Boolean(isActive),
  });
  return created.toObject({ versionKey: false });
};

const listPublicGenres = async () => {
  return listGenres({ isActive: true });
};

const listAdminGenres = async () => {
  return listGenres();
};

const updateGenreEntry = async (genreId, payload) => {
  assertObjectId(genreId, "genreId");
  const update = {};

  if (payload.name !== undefined) {
    const validatedName = validateName(payload.name);
    const normalizedName = normalizeName(validatedName);
    const existing = await findGenreByNormalizedName(normalizedName);
    if (existing && String(existing._id) !== String(genreId)) {
      throw httpError(409, "Genre already exists");
    }
    update.name = validatedName;
    update.normalizedName = normalizedName;
  }

  if (payload.isActive !== undefined) {
    update.isActive = Boolean(payload.isActive);
  }

  const updated = await updateGenreById(genreId, update);
  if (!updated) {
    throw httpError(404, "Genre not found");
  }
  return updated;
};

const deleteGenreEntry = async (genreId) => {
  assertObjectId(genreId, "genreId");
  const deleted = await deleteGenreById(genreId);
  if (!deleted) {
    throw httpError(404, "Genre not found");
  }
  return deleted;
};

const getGenreById = async (genreId) => {
  assertObjectId(genreId, "genreId");
  return findGenreById(genreId);
};

module.exports = {
  createGenreEntry,
  listPublicGenres,
  listAdminGenres,
  updateGenreEntry,
  deleteGenreEntry,
  getGenreById,
};
