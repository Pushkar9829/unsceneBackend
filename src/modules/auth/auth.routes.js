const express = require("express");
const { userSendOtp, userVerifyOtp, adminLogin, refreshTokens, logout } = require("./auth.controller");
const { authenticate } = require("../../common/middleware/auth.middleware");

const router = express.Router();

router.post("/user/send-otp", userSendOtp);
router.post("/user/verify-otp", userVerifyOtp);
router.post("/admin/login", adminLogin);
router.post("/refresh", refreshTokens);
router.post("/logout", authenticate, logout);

module.exports = router;
