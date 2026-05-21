const {
  getUserProfile,
  updateUserProfile,
  presignUserProfileImageUpload,
  addSeriesToFavorites,
  removeSeriesFromFavorites,
  listFavoriteSeries,
  sendDeleteAccountOtp,
  deleteUserAccount,
} = require("./user.service");
const { successResponse, errorResponse } = require("../../common/utils/response");

const statusFromError = (error, fallback) =>
  Number.isFinite(Number(error?.statusCode)) ? Number(error.statusCode) : fallback;

const getMe = async (req, res) => {
  try {
    const user = await getUserProfile(req.user.id);
    return successResponse(res, user, "User profile fetched");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 404));
  }
};

const patchMe = async (req, res) => {
  try {
    const user = await updateUserProfile(req.user.id, req.body);
    return successResponse(res, user, "Profile updated");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

const getFavoriteSeries = async (req, res) => {
  try {
    const data = await listFavoriteSeries(req.user.id, req.query);
    return successResponse(res, data, "Favorite series");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

const postFavoriteSeries = async (req, res) => {
  try {
    const seriesId = req.body?.seriesId ?? req.body?.series_id;
    const data = await addSeriesToFavorites(req.user.id, seriesId);
    return successResponse(res, data, "Added to favorites", 201);
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

const deleteFavoriteSeries = async (req, res) => {
  try {
    const data = await removeSeriesFromFavorites(req.user.id, req.params.seriesId);
    return successResponse(res, data, "Removed from favorites");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

const presignProfileImage = async (req, res) => {
  try {
    console.log("[USER][PROFILE_IMAGE] presign request body", req.body);
    const data = await presignUserProfileImageUpload(req.user.id, req.body);
    return successResponse(res, data, "Profile image upload URL created");
  } catch (error) {
    console.log("[USER][PROFILE_IMAGE] presign failed", {
      body: req.body,
      error: error.message,
    });
    return errorResponse(res, error.message, 400);
  }
};

const postDeleteAccountSendOtp = async (req, res) => {
  try {
    await sendDeleteAccountOtp(req.user.id);
    return successResponse(res, null, "OTP sent successfully.");
  } catch (error) {
    const status = error.message === "Failed to send OTP" ? 500 : statusFromError(error, 400);
    return errorResponse(res, error.message, status);
  }
};

const deleteMe = async (req, res) => {
  try {
    const data = await deleteUserAccount(req.user.id, req.body);
    return successResponse(res, data, "Account deleted");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

module.exports = {
  getMe,
  patchMe,
  presignProfileImage,
  getFavoriteSeries,
  postFavoriteSeries,
  deleteFavoriteSeries,
  postDeleteAccountSendOtp,
  deleteMe,
};
