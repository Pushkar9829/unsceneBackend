const { errorResponse } = require("../utils/response");

const notFoundHandler = (req, res) => {
  return errorResponse(res, `Route not found: ${req.originalUrl}`, 404);
};

const globalErrorHandler = (error, req, res, next) => {
  console.error(error);
  const status =
    error.statusCode || error.status || (error.name === "ValidationError" ? 400 : null) || 500;
  return errorResponse(res, error.message || "Internal server error", status);
};

module.exports = {
  notFoundHandler,
  globalErrorHandler,
};
