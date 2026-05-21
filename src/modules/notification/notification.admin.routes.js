const express = require("express");
const { authenticate, authorize } = require("../../common/middleware/auth.middleware");
const { ROLES } = require("../../config/constants");
const { adminSend } = require("./notification.controller");

const router = express.Router();

router.post("/", authenticate, authorize(ROLES.ADMIN), adminSend);

module.exports = router;
