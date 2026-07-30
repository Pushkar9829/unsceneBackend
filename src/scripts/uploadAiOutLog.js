#!/usr/bin/env node
/**
 * Upload the complete PM2 API output log to S3.
 *
 * EC2 usage:
 *   npm run upload:ai-log
 *
 * Overrides:
 *   LOG_PATH=/path/to/unscene-api-out.log npm run upload:ai-log
 *   S3_LOG_FOLDER=diagnostics/ai npm run upload:ai-log
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { uploadBufferToS3 } = require("../common/services/s3.service");

const LOG_PATH =
  process.env.LOG_PATH || path.join(os.homedir(), ".pm2/logs/unscene-api-out.log");
const S3_LOG_FOLDER = process.env.S3_LOG_FOLDER || "diagnostics/ai-ingest";

const redact = (text) =>
  String(text)
    .replace(/(Authorization["']?\s*[:=]\s*["']?Bearer\s+)[^\s"',}]+/gi, "$1***")
    .replace(/(x-ai-webhook-secret["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, "$1***")
    .replace(/([?&]X-Amz-Signature=)[^&\s]+/gi, "$1***")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "<redacted-jwt>");

const readLog = () => {
  if (!fs.existsSync(LOG_PATH)) {
    throw new Error(`PM2 output log not found: ${LOG_PATH}`);
  }
  return fs.readFileSync(LOG_PATH, "utf8");
};

const run = async () => {
  const raw = readLog();
  const log = redact(raw);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const host = os.hostname().replace(/[^a-zA-Z0-9_.-]/g, "_");
  const fileName = `unscene-api-out-${host}-${timestamp}-complete.log`;

  const uploaded = await uploadBufferToS3({
    folder: S3_LOG_FOLDER,
    fileName,
    contentType: "text/plain; charset=utf-8",
    body: Buffer.from(log, "utf8"),
  });

  console.log(
    JSON.stringify(
      {
        success: true,
        sourceLog: LOG_PATH,
        completeLog: true,
        uploadedBytes: Buffer.byteLength(log, "utf8"),
        bucket: uploaded.bucket,
        key: uploaded.key,
        publicUrl: uploaded.publicUrl,
      },
      null,
      2
    )
  );
};

run().catch((err) => {
  console.error("[upload-ai-log] FAILED:", err?.message || err);
  process.exit(1);
});
