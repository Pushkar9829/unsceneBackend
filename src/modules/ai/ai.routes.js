const express = require("express");
const { verifyAiWebhookSecret } = require("../../common/middleware/aiWebhook.middleware");
const { productCuesCallback } = require("./ai.controller");

const router = express.Router();

router.post("/product-cues/callback", verifyAiWebhookSecret, productCuesCallback);

module.exports = router;
