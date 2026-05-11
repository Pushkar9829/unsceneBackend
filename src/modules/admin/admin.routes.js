const express = require("express");
const { getMe } = require("./admin.controller");
const governance = require("./adminGovernance.controller");
const { authenticate, authorize } = require("../../common/middleware/auth.middleware");
const { ROLES } = require("../../config/constants");

const router = express.Router();

router.get("/me", authenticate, authorize(ROLES.ADMIN), getMe);

const adminOnly = [authenticate, authorize(ROLES.ADMIN)];

router.get("/dashboard/summary", ...adminOnly, governance.dashboardSummary);
router.get("/health/deps", ...adminOnly, governance.healthDeps);

router.get("/series", ...adminOnly, governance.seriesList);
router.get("/series/:seriesId/episodes", ...adminOnly, governance.episodesList);
router.patch("/series/:seriesId/episodes/:episodeId", ...adminOnly, governance.episodePatch);
router.get("/series/:seriesId", ...adminOnly, governance.seriesDetail);
router.patch("/series/:seriesId", ...adminOnly, governance.seriesPatch);
router.post("/series/:seriesId/action", ...adminOnly, governance.seriesAction);

router.get("/users", ...adminOnly, governance.usersList);
router.get("/users/:userId", ...adminOnly, governance.userDetail);
router.patch("/users/:userId", ...adminOnly, governance.userPatch);

router.get("/analytics/overview", ...adminOnly, governance.analyticsOverview);
router.get("/analytics/series", ...adminOnly, governance.analyticsSeriesTop);
router.get("/analytics/series/:seriesId", ...adminOnly, governance.analyticsSeriesDetail);
router.get("/analytics/episodes/:seriesId", ...adminOnly, governance.analyticsEpisodesTable);
router.get("/analytics/events/sample", ...adminOnly, governance.analyticsEventsSample);

router.get("/audit-log", ...adminOnly, governance.auditLog);

module.exports = router;
