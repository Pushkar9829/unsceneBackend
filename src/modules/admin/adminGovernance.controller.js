const { successResponse } = require("../../common/utils/response");
const governance = require("./adminGovernance.service");

const dashboardSummary = async (req, res, next) => {
  try {
    const data = await governance.getDashboardSummary();
    return successResponse(res, data, "Dashboard summary");
  } catch (error) {
    return next(error);
  }
};

const healthDeps = async (req, res, next) => {
  try {
    const data = await governance.getHealthDeps();
    return successResponse(res, data, "Dependency health");
  } catch (error) {
    return next(error);
  }
};

const seriesList = async (req, res, next) => {
  try {
    const data = await governance.listSeriesAdmin(req.query);
    return successResponse(res, data, "Series list");
  } catch (error) {
    return next(error);
  }
};

const seriesDetail = async (req, res, next) => {
  try {
    const data = await governance.getSeriesDetailAdmin(req.params.seriesId);
    return successResponse(res, data, "Series detail");
  } catch (error) {
    return next(error);
  }
};

const seriesPatch = async (req, res, next) => {
  try {
    const data = await governance.patchSeriesAdmin(req.user.id, req.params.seriesId, req.body);
    return successResponse(res, data, "Series updated");
  } catch (error) {
    return next(error);
  }
};

const seriesAction = async (req, res, next) => {
  try {
    const data = await governance.postSeriesActionAdmin(req.user.id, req.params.seriesId, req.body);
    return successResponse(res, data, "Series action applied");
  } catch (error) {
    return next(error);
  }
};

const episodesList = async (req, res, next) => {
  try {
    const data = await governance.listEpisodesAdmin(req.params.seriesId);
    return successResponse(res, data, "Episodes");
  } catch (error) {
    return next(error);
  }
};

const episodePatch = async (req, res, next) => {
  try {
    const data = await governance.patchEpisodeAdmin(
      req.user.id,
      req.params.seriesId,
      req.params.episodeId,
      req.body
    );
    return successResponse(res, data, "Episode updated");
  } catch (error) {
    return next(error);
  }
};

const usersList = async (req, res, next) => {
  try {
    const data = await governance.listUsersAdmin(req.query);
    return successResponse(res, data, "Users");
  } catch (error) {
    return next(error);
  }
};

const userDetail = async (req, res, next) => {
  try {
    const data = await governance.getUserDetailAdmin(req.params.userId);
    return successResponse(res, data, "User detail");
  } catch (error) {
    return next(error);
  }
};

const userPatch = async (req, res, next) => {
  try {
    const data = await governance.patchUserAdmin(req.user.id, req.params.userId, req.body);
    return successResponse(res, data, "User updated");
  } catch (error) {
    return next(error);
  }
};

const analyticsOverview = async (req, res, next) => {
  try {
    const data = await governance.getAnalyticsOverviewAdmin(req.query);
    return successResponse(res, data, "Analytics overview");
  } catch (error) {
    return next(error);
  }
};

const analyticsSeriesTop = async (req, res, next) => {
  try {
    const data = await governance.getAnalyticsSeriesTopAdmin(req.query);
    return successResponse(res, data, "Top series");
  } catch (error) {
    return next(error);
  }
};

const analyticsSeriesDetail = async (req, res, next) => {
  try {
    const data = await governance.getAnalyticsSeriesDetailAdmin(req.params.seriesId, req.query);
    return successResponse(res, data, "Series analytics");
  } catch (error) {
    return next(error);
  }
};

const analyticsEpisodesTable = async (req, res, next) => {
  try {
    const data = await governance.getEpisodeAnalyticsTableAdmin(req.params.seriesId, req.query);
    return successResponse(res, data, "Episode analytics");
  } catch (error) {
    return next(error);
  }
};

const analyticsEventsSample = async (req, res, next) => {
  try {
    const data = await governance.getSampleEventsAdmin(req.query);
    return successResponse(res, data, "Sample events");
  } catch (error) {
    return next(error);
  }
};

const auditLog = async (req, res, next) => {
  try {
    const data = await governance.getAuditLogAdmin(req.query);
    return successResponse(res, data, "Audit log");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  dashboardSummary,
  healthDeps,
  seriesList,
  seriesDetail,
  seriesPatch,
  seriesAction,
  episodesList,
  episodePatch,
  usersList,
  userDetail,
  userPatch,
  analyticsOverview,
  analyticsSeriesTop,
  analyticsSeriesDetail,
  analyticsEpisodesTable,
  analyticsEventsSample,
  auditLog,
};
