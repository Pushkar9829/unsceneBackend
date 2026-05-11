const express = require("express");
const { userVerifyOtp, adminLogin, refreshTokens, logout } = require("./auth.controller");
const { authenticate } = require("../../common/middleware/auth.middleware");

const router = express.Router();

router.post("/user/verify-otp", userVerifyOtp);
router.post("/admin/login", adminLogin);
router.post("/refresh", refreshTokens);
router.post("/logout", authenticate, logout);

module.exports = router;
