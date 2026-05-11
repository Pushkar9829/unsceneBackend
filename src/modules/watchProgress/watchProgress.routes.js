const express = require("express");
const { authenticate, authorize } = require("../../common/middleware/auth.middleware");
const { ROLES } = require("../../config/constants");
const { putProgress, getProgress, listProgress, deleteProgress } = require("./watchProgress.controller");

const router = express.Router();

router.use(authenticate, authorize(ROLES.USER));

router.get("/", listProgress);
router.get("/:seriesId", getProgress);
router.put("/:seriesId", putProgress);
router.delete("/:seriesId", deleteProgress);

module.exports = router;
