const path = require("path");
const dotenv = require("dotenv");

const srcEnvPath = path.resolve(__dirname, "../.env");
const rootEnvPath = path.resolve(__dirname, "../../.env");

// src/.env is the source of truth for local/dev
dotenv.config({ path: srcEnvPath, override: true });
// optional fallback: backend/.env (does not override src/.env)
dotenv.config({ path: rootEnvPath });

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/unscene_ai",
  jwtSecret: process.env.JWT_SECRET || "unsceneai-dev-secret",
  /** Short-lived access JWT (Bearer on API calls). */
  jwtAccessExpiresIn:
    process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || "15m",
  /** Long-lived refresh JWT (session extension; rotated on /auth/refresh). */
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  awsRegion: process.env.AWS_REGION || "",
  awsS3Bucket: process.env.AWS_S3_BUCKET || "",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  awsCloudFrontDomain: process.env.AWS_CLOUDFRONT_DOMAIN || "",
  adminName: process.env.DEFAULT_ADMIN_NAME || "Super Admin",
  adminEmail: process.env.DEFAULT_ADMIN_EMAIL || "admin@unscene.ai",
  defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123",
  /** Comma-separated extra browser origins for CORS (e.g. https://admin.example.com). */
  corsExtraOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  msg91AuthKey: process.env.MSG91_AUTH_KEY || "",
  msg91FlowId: process.env.MSG91_FLOW_ID || "",
  msg91SenderId: process.env.MSG91_SENDER_ID || "",
  /** Msg91 flow template variable name (e.g. var, VAR1). If unset, common keys are sent. */
  msg91OtpVarName: process.env.MSG91_OTP_VAR_NAME || "",
  /**
   * Play Store / QA test login — 10-digit Indian mobile (no +91).
   * Set DEMO_OTP_ENABLED=false in production when review is complete.
   */
  demoOtpEnabled: process.env.DEMO_OTP_ENABLED !== "false",
  demoPhone: process.env.DEMO_PHONE || "9999999999",
  demoOtp: process.env.DEMO_OTP || "123456",
  /** Product-cue AI service (separate deployment). */
  aiIngestEnabled: process.env.AI_INGEST_ENABLED !== "false",
  aiServiceUrl: (process.env.AI_SERVICE_URL || "").replace(/\/+$/, ""),
  aiServiceApiKey: process.env.AI_SERVICE_API_KEY || "",
  aiWebhookSecret: process.env.AI_WEBHOOK_SECRET || "",
  /** Public API origin for callbackUrl in AI job payload. */
  aiCallbackPublicBaseUrl: (process.env.AI_CALLBACK_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(
    /\/+$/,
    ""
  ),
};

module.exports = env;
