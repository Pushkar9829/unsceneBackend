const env = require("../../config/env");
const { errorResponse } = require("../utils/response");

/**
 * Validates X-AI-Webhook-Secret when AI_WEBHOOK_SECRET is set.
 * When unset, callbacks are accepted without auth (dev / trusted network).
 */
const verifyAiWebhookSecret = (req, res, next) => {
  const expected = env.aiWebhookSecret;
  if (!expected || String(expected).trim() === "") {
    return next();
  }
  const provided = req.headers["x-ai-webhook-secret"];
  if (!provided || String(provided) !== String(expected)) {
    return errorResponse(res, "Unauthorized", 401);
  }
  return next();
};

module.exports = {
  verifyAiWebhookSecret,
};
