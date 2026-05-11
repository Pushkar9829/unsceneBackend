const { successResponse } = require("../../common/utils/response");
const { searchAllSeries } = require("./series.service");

const listCatalog = async (req, res, next) => {
  try {
    const data = await searchAllSeries(req.query);
    return successResponse(res, data, "Series list");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listCatalog,
};
