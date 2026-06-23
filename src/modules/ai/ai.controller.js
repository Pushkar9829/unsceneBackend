const { successResponse } = require("../../common/utils/response");
const { logAiExchange } = require("../../common/utils/aiLogger");
const { applyProductCueResults } = require("../../common/services/aiIngest.service");

const productCuesCallback = async (req, res, next) => {
  try {
    const body = req.body || {};
    const seriesId = body.seriesId;
    if (!seriesId) {
      const err = new Error("seriesId is required");
      err.statusCode = 400;
      throw err;
    }

    logAiExchange("inbound", {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      requestBody: body,
    });

    const data = await applyProductCueResults(String(seriesId), body);

    logAiExchange("inbound", {
      method: req.method,
      url: req.originalUrl,
      status: 200,
      responseBody: data,
      note: "Product cues applied",
    });

    return successResponse(res, data, "Product cues applied");
  } catch (error) {
    logAiExchange("inbound", {
      method: req.method,
      url: req.originalUrl,
      status: error.statusCode || 500,
      responseBody: { error: error.message || "Callback failed" },
    });
    return next(error);
  }
};

module.exports = {
  productCuesCallback,
};
