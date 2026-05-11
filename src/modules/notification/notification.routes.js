const express = require("express");
const { authenticate, authorize } = require("../../common/middleware/auth.middleware");
const { ROLES } = require("../../config/constants");
const { list, unreadCount } = require("./notification.controller");

const router = express.Router();

router.use(authenticate, authorize(ROLES.USER));

router.get("/list", list);
router.get("/unread-count", unreadCount);

module.exports = router;

