const { successResponse } = require("../../common/utils/response");
const { ingestAnalyticsEvents } = require("./analytics.service");

const postEvents = async (req, res, next) => {
  try {
    const data = await ingestAnalyticsEvents(req.body || {}, req.user);
    return successResponse(res, data, "Events recorded", 200);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  postEvents,
};
