const jwt = require("jsonwebtoken");
const env = require("../../config/env");
const { TOKEN_TYPE } = require("../../config/constants");

const signAccessToken = (payload) => {
  return jwt.sign({ ...payload, typ: TOKEN_TYPE.ACCESS }, env.jwtSecret, {
    expiresIn: env.jwtAccessExpiresIn,
  });
};

const signRefreshToken = (payload) => {
  return jwt.sign({ ...payload, typ: TOKEN_TYPE.REFRESH }, env.jwtSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  });
};

const verifyAccessToken = (token) => {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (decoded.typ !== TOKEN_TYPE.ACCESS) {
    const err = new Error("Invalid token type");
    err.statusCode = 401;
    throw err;
  }
  return decoded;
};

const verifyRefreshToken = (token) => {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (decoded.typ !== TOKEN_TYPE.REFRESH) {
    const err = new Error("Invalid refresh token");
    err.statusCode = 401;
    throw err;
  }
  return decoded;
};

/** Alias used where a single “login token” name reads better than “access”. */
const signToken = signAccessToken;

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  signToken,
};
