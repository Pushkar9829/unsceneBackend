const {
  upsertWatchProgress,
  getWatchProgress,
  listWatchProgress,
  deleteWatchProgress,
} = require("./watchProgress.service");
const { successResponse, errorResponse } = require("../../common/utils/response");

const statusFromError = (error, fallback) =>
  Number.isFinite(Number(error?.statusCode)) ? Number(error.statusCode) : fallback;

const putProgress = async (req, res) => {
  try {
    const data = await upsertWatchProgress(req.user.id, req.params.seriesId, req.body || {});
    return successResponse(res, data, "Watch progress saved");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

const getProgress = async (req, res) => {
  try {
    const data = await getWatchProgress(req.user.id, req.params.seriesId);
    return successResponse(res, data, data ? "Watch progress" : "No saved progress");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

const listProgress = async (req, res) => {
  try {
    const data = await listWatchProgress(req.user.id, req.query);
    return successResponse(res, data, "Watch progress list");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

const deleteProgress = async (req, res) => {
  try {
    const data = await deleteWatchProgress(req.user.id, req.params.seriesId);
    return successResponse(res, data, "Watch progress cleared");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

module.exports = {
  putProgress,
  getProgress,
  listProgress,
  deleteProgress,
};
