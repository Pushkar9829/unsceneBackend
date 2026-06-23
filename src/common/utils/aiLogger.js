const safeJson = (value) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const redactHeaders = (headers = {}) => {
  const out = { ...headers };
  if (out.Authorization) {
    out.Authorization = "Bearer ***";
  }
  if (out["x-ai-webhook-secret"]) {
    out["x-ai-webhook-secret"] = "***";
  }
  return out;
};

/**
 * Console-log AI outbound/inbound exchanges (request + response).
 */
const logAiExchange = (direction, meta = {}) => {
  const label = direction === "outbound" ? "AI OUTBOUND REQUEST" : "AI CALLBACK RECEIVED";
  const lines = [
    "",
    "=".repeat(72),
    `[ai-ingest] ${label}`,
    "=".repeat(72),
  ];

  if (meta.method && meta.url) {
    lines.push(`${meta.method} ${meta.url}`);
  }
  if (meta.headers) {
    lines.push("Headers:", safeJson(redactHeaders(meta.headers)));
  }
  if (meta.requestBody !== undefined) {
    lines.push("Request body:", safeJson(meta.requestBody));
  }
  if (meta.status !== undefined) {
    lines.push(`Response status: ${meta.status}`);
  }
  if (meta.responseBody !== undefined) {
    lines.push("Response body:", safeJson(meta.responseBody));
  }
  if (meta.note) {
    lines.push(`Note: ${meta.note}`);
  }
  lines.push("=".repeat(72), "");
  console.log(lines.join("\n"));
};

module.exports = {
  logAiExchange,
};
