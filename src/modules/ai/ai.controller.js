const { successResponse } = require("../../common/utils/response");
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
    const data = await applyProductCueResults(String(seriesId), body);
    return successResponse(res, data, "Product cues applied");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  productCuesCallback,
};
