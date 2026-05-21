const TOKEN_TYPE = {
  ACCESS: "access",
  REFRESH: "refresh",
};

const ROLES = {
  USER: "user",
  ADMIN: "admin",
};

/** Allowed values for `Series.type` (content kind). */
const SERIES_TYPES = ["micro_drama", "short_series", "other"];

module.exports = {
  TOKEN_TYPE,
  ROLES,
  SERIES_TYPES,
};
