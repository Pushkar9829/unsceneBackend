const { successResponse } = require("../../common/utils/response");
const {
  createUserSeries,
  presignSeriesUpload,
  registerEpisode,
  registerProduct,
  uploadEpisodeAndRegister,
  uploadProductAndRegister,
  uploadThumbnailAndRegister,
  updateUserSeries,
  getSeriesForUser,
  listUserSeries,
  patchUserSeriesEpisode,
  getCreatorSeriesStatsForUser,
} = require("./series.service");

const createSeries = async (req, res, next) => {
  try {
    const series = await createUserSeries(req.user.id, req.body);
    return successResponse(res, series, "Series created", 201);
  } catch (error) {
    return next(error);
  }
};

const listSeries = async (req, res, next) => {
  try {
    const data = await listUserSeries(req.user.id);
    return successResponse(res, data, "Series list");
  } catch (error) {
    return next(error);
  }
};

const getCreatorSeriesStats = async (req, res, next) => {
  try {
    const data = await getCreatorSeriesStatsForUser(req.user.id, req.params.seriesId);
    return successResponse(res, data, "Series analytics summary");
  } catch (error) {
    return next(error);
  }
};

const getSeries = async (req, res, next) => {
  try {
    const data = await getSeriesForUser(req.user.id, req.params.seriesId);
    return successResponse(res, data, "Series detail");
  } catch (error) {
    return next(error);
  }
};

const patchSeries = async (req, res, next) => {
  try {
    const data = await updateUserSeries(req.user.id, req.params.seriesId, req.body);
    return successResponse(res, data, "Series updated");
  } catch (error) {
    return next(error);
  }
};

const presignUpload = async (req, res, next) => {
  try {
    const data = await presignSeriesUpload(req.user.id, req.params.seriesId, req.body);
    return successResponse(res, data, "Presigned upload URL created");
  } catch (error) {
    return next(error);
  }
};

const addEpisode = async (req, res, next) => {
  try {
    const data = await registerEpisode(req.user.id, req.params.seriesId, req.body);
    return successResponse(res, data, "Episode saved");
  } catch (error) {
    return next(error);
  }
};

const patchEpisode = async (req, res, next) => {
  try {
    const data = await patchUserSeriesEpisode(req.user.id, req.params.seriesId, req.params.episodeId, req.body);
    return successResponse(res, data, "Episode updated");
  } catch (error) {
    return next(error);
  }
};

const addProduct = async (req, res, next) => {
  try {
    const data = await registerProduct(req.user.id, req.params.seriesId, req.body);
    return successResponse(res, data, "Product saved");
  } catch (error) {
    return next(error);
  }
};

const uploadEpisodeMultipart = async (req, res, next) => {
  try {
    const data = await uploadEpisodeAndRegister(req.user.id, req.params.seriesId, req.body, req.file);
    return successResponse(res, data, "Episode uploaded");
  } catch (error) {
    return next(error);
  }
};

const uploadProductMultipart = async (req, res, next) => {
  try {
    const data = await uploadProductAndRegister(req.user.id, req.params.seriesId, req.body, req.file);
    return successResponse(res, data, "Product uploaded");
  } catch (error) {
    return next(error);
  }
};

const uploadThumbnailMultipart = async (req, res, next) => {
  try {
    const data = await uploadThumbnailAndRegister(req.user.id, req.params.seriesId, req.file);
    return successResponse(res, data, "Thumbnail uploaded");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createSeries,
  listSeries,
  getCreatorSeriesStats,
  getSeries,
  patchSeries,
  presignUpload,
  addEpisode,
  patchEpisode,
  addProduct,
  uploadEpisodeMultipart,
  uploadProductMultipart,
  uploadThumbnailMultipart,
};
