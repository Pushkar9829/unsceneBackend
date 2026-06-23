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

/** AI product-cue ingest lifecycle on a series document. */
const AI_PROCESSING_STATUS = {
  IDLE: "idle",
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
};

module.exports = {
  TOKEN_TYPE,
  ROLES,
  SERIES_TYPES,
  AI_PROCESSING_STATUS,
};
