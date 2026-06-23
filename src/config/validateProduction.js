const env = require("./env");

const WEAK_JWT_SECRETS = new Set([
  "replace-this-secret",
  "unsceneai-dev-secret",
  "change-me",
  "secret",
]);

/**
 * Log production misconfigurations at startup (does not exit).
 */
const validateProductionEnv = () => {
  if (!env.isProduction) {
    return;
  }

  const warnings = [];

  if (!env.jwtSecret || WEAK_JWT_SECRETS.has(env.jwtSecret)) {
    warnings.push("JWT_SECRET is missing or uses a default value — set a long random secret.");
  }

  if (env.demoOtpEnabled) {
    warnings.push("DEMO_OTP_ENABLED is true — disable for production (DEMO_OTP_ENABLED=false).");
  }

  if (/localhost|127\.0\.0\.1/i.test(env.aiCallbackPublicBaseUrl)) {
    warnings.push(
      "AI_CALLBACK_PUBLIC_BASE_URL points to localhost — AI callbacks will not reach this server."
    );
  }

  if (env.aiIngestEnabled && !env.aiServiceUrl) {
    warnings.push("AI_INGEST_ENABLED but AI_SERVICE_URL is empty — AI analysis will be skipped.");
  }

  if (env.defaultAdminPassword === "Admin@123") {
    warnings.push("DEFAULT_ADMIN_PASSWORD is still the default — change before go-live.");
  }

  if (!env.mongoUri.includes("auth") && !env.mongoUri.includes("@")) {
    warnings.push("MONGO_URI has no credentials — ensure the database is not publicly writable.");
  }

  if (warnings.length) {
    console.warn("[production] Environment warnings:");
    warnings.forEach((msg) => console.warn(`  - ${msg}`));
  } else {
    console.log("[production] Environment checks passed.");
  }
};

module.exports = validateProductionEnv;
