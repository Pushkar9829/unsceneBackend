const { verifyAccessToken } = require("../utils/jwt");
const { errorResponse } = require("../utils/response");

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return errorResponse(res, "Unauthorized", 401);
  }

  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch (error) {
    return errorResponse(res, error.message || "Invalid token", 401);
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return errorResponse(res, "Forbidden", 403);
    }
    return next();
  };
};

module.exports = {
  authenticate,
  authorize,
};
