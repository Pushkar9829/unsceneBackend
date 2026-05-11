const express = require("express");
const { authenticate, authorize } = require("../../common/middleware/auth.middleware");
const { ROLES } = require("../../config/constants");
const {
  listGenresPublic,
  listGenresAdmin,
  createGenreAdmin,
  patchGenreAdmin,
  deleteGenreAdmin,
} = require("./genre.controller");

const publicRouter = express.Router();
const adminRouter = express.Router();

publicRouter.get("/", listGenresPublic);

adminRouter.use(authenticate, authorize(ROLES.ADMIN));
adminRouter.get("/", listGenresAdmin);
adminRouter.post("/", createGenreAdmin);
adminRouter.patch("/:genreId", patchGenreAdmin);
adminRouter.delete("/:genreId", deleteGenreAdmin);

module.exports = {
  publicRouter,
  adminRouter,
};
