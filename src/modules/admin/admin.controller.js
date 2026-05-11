const { getAdminProfile } = require("./admin.service");
const { successResponse, errorResponse } = require("../../common/utils/response");

const getMe = async (req, res) => {
  try {
    const admin = await getAdminProfile(req.user.id);
    return successResponse(res, admin, "Admin profile fetched");
  } catch (error) {
    return errorResponse(res, error.message, 404);
  }
};

module.exports = {
  getMe,
};
