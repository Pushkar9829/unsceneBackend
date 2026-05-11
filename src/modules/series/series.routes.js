const express = require("express");
const multer = require("multer");
const { authenticate, authorize } = require("../../common/middleware/auth.middleware");
const { ROLES } = require("../../config/constants");
const {
  createSeries,
  listSeries,
  getCreatorSeriesStats,
  getSeries,
  patchSeries,
  presignUpload,
  addEpisode,
  patchEpisode,
  addProduct,
  uploadEpisodeMultipart,
  uploadProductMultipart,
  uploadThumbnailMultipart,
} = require("./series.controller");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate, authorize(ROLES.USER));

router.post("/", createSeries);
router.get("/", listSeries);
router.get("/:seriesId/stats/summary", getCreatorSeriesStats);
router.get("/:seriesId", getSeries);
router.patch("/:seriesId", patchSeries);
router.post("/:seriesId/upload/presign", presignUpload);
router.post("/:seriesId/episodes", addEpisode);
router.patch("/:seriesId/episodes/:episodeId", patchEpisode);
router.post("/:seriesId/products", addProduct);
router.post("/:seriesId/episodes/upload", upload.single("file"), uploadEpisodeMultipart);
router.post("/:seriesId/products/upload", upload.single("file"), uploadProductMultipart);
router.post("/:seriesId/thumbnail/upload", upload.single("file"), uploadThumbnailMultipart);

module.exports = router;
