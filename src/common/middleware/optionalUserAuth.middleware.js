const { verifyAccessToken } = require("../utils/jwt");
const { ROLES } = require("../../config/constants");

/**
 * If `Authorization: Bearer <valid user token>` is present, sets `req.user`.
 * Does not fail on missing or invalid token (anonymous analytics allowed).
 */
const optionalUserAuth = (req, _res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return next();
  }
  try {
    const payload = verifyAccessToken(token);
    if (payload && payload.role === ROLES.USER && payload.id) {
      req.user = payload;
    }
  } catch (_e) {
    /* anonymous */
  }
  return next();
};

module.exports = {
  optionalUserAuth,
};
