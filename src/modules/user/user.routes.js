const express = require("express");
const {
  getMe,
  patchMe,
  presignProfileImage,
  getFavoriteSeries,
  postFavoriteSeries,
  deleteFavoriteSeries,
} = require("./user.controller");
const { authenticate, authorize } = require("../../common/middleware/auth.middleware");
const { ROLES } = require("../../config/constants");

const router = express.Router();

router.get("/me", authenticate, authorize(ROLES.USER), getMe);
router.patch("/me", authenticate, authorize(ROLES.USER), patchMe);
router.post("/me/profile-image/presign", authenticate, authorize(ROLES.USER), presignProfileImage);

router.get("/favorite-series", authenticate, authorize(ROLES.USER), getFavoriteSeries);
router.post("/favorite-series", authenticate, authorize(ROLES.USER), postFavoriteSeries);
router.delete("/favorite-series/:seriesId", authenticate, authorize(ROLES.USER), deleteFavoriteSeries);

module.exports = router;
