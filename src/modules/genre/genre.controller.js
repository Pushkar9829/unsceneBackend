const { successResponse } = require("../../common/utils/response");
const {
  createGenreEntry,
  listPublicGenres,
  listAdminGenres,
  updateGenreEntry,
  deleteGenreEntry,
} = require("./genre.service");

const listGenresPublic = async (req, res, next) => {
  try {
    const data = await listPublicGenres();
    return successResponse(res, data, "Genres list");
  } catch (error) {
    return next(error);
  }
};

const listGenresAdmin = async (req, res, next) => {
  try {
    const data = await listAdminGenres();
    return successResponse(res, data, "Genres list");
  } catch (error) {
    return next(error);
  }
};

const createGenreAdmin = async (req, res, next) => {
  try {
    const data = await createGenreEntry(req.body || {});
    return successResponse(res, data, "Genre created", 201);
  } catch (error) {
    return next(error);
  }
};

const patchGenreAdmin = async (req, res, next) => {
  try {
    const data = await updateGenreEntry(req.params.genreId, req.body || {});
    return successResponse(res, data, "Genre updated");
  } catch (error) {
    return next(error);
  }
};

const deleteGenreAdmin = async (req, res, next) => {
  try {
    const data = await deleteGenreEntry(req.params.genreId);
    return successResponse(res, data, "Genre deleted");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listGenresPublic,
  listGenresAdmin,
  createGenreAdmin,
  patchGenreAdmin,
  deleteGenreAdmin,
};
