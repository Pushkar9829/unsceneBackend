const {
  verifyUserOtpAndAuth,
  loginAdmin,
  refreshSession,
  logoutWithAccessToken,
} = require("./auth.service");
const { successResponse, errorResponse } = require("../../common/utils/response");

const userVerifyOtp = async (req, res) => {
  try {
    console.log("[AUTH][USER] verify-otp request", { phone: req.body?.phone });
    const result = await verifyUserOtpAndAuth(req.body);
    console.log("[AUTH][USER] verify-otp success", {
      userId: result.user?._id,
      isNewUser: result.isNewUser,
    });
    return successResponse(res, result, "User authenticated successfully");
  } catch (error) {
    console.log("[AUTH][USER] verify-otp failed", { error: error.message });
    return errorResponse(res, error.message, 400);
  }
};

const adminLogin = async (req, res) => {
  try {
    console.log("[AUTH][ADMIN] login request", { email: req.body?.email });
    const result = await loginAdmin(req.body);
    console.log("[AUTH][ADMIN] login success", { adminId: result.admin?.id });
    return successResponse(res, result, "Admin login successful");
  } catch (error) {
    console.log("[AUTH][ADMIN] login failed", { email: req.body?.email, error: error.message });
    return errorResponse(res, error.message, 400);
  }
};

const refreshTokens = async (req, res) => {
  try {
    const result = await refreshSession(req.body);
    return successResponse(res, result, "Tokens refreshed");
  } catch (error) {
    console.log("[AUTH] refresh failed", { error: error.message });
    return errorResponse(res, error.message, 401);
  }
};

const logout = async (req, res) => {
  try {
    await logoutWithAccessToken(req.user);
    return successResponse(res, null, "Logged out");
  } catch (error) {
    console.log("[AUTH] logout failed", { error: error.message });
    return errorResponse(res, error.message, 400);
  }
};

module.exports = {
  userVerifyOtp,
  adminLogin,
  refreshTokens,
  logout,
};
