#!/usr/bin/env node
/**
 * End-to-end AI flow test: login → create series → upload episode + product → trigger AI → callback.
 *
 * Run on EC2 (from backend repo root):
 *   bash scripts/test-ai-flow.sh
 *
 * Or directly (no chmod):
 *   API_BASE_URL=https://api.unscene.in ACCESS_TOKEN=<jwt> node src/scripts/testAiFlow.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
const SIMULATE_CALLBACK = process.env.SIMULATE_CALLBACK !== "false";
const SKIP_AI_TRIGGER = process.env.SKIP_AI_TRIGGER === "true";

const isLikelyJwt = (token) =>
  typeof token === "string" &&
  token.length > 20 &&
  !/paste|your|token|here|\.\.\./i.test(token) &&
  token.split(".").length === 3;

const assertAccessToken = (token) => {
  if (!isLikelyJwt(token)) {
    throw new Error(
      "Invalid ACCESS_TOKEN. Use a real JWT from verify-otp (starts with eyJ..., three dot-separated parts). " +
        "Example: ACCESS_TOKEN=$(curl -s ... verify-otp ... | jq -r '.data.token')"
    );
  }
};

const DEFAULT_VIDEO_URL =
  "https://d1gq4x8e2l4u04.cloudfront.net/users/69f86e79a7cdeb44c6a9e441/series/69fe36c51f3977b48b2e7782/episodes/1778443081381-6e8cbb62-f03c-4cea-88c6-8ef8cb9f8c5c-vtoVideo.mp4";
const DEFAULT_PRODUCT_URL =
  "https://d1gq4x8e2l4u04.cloudfront.net/users/69f86e79a7cdeb44c6a9e441/series/69fe36c51f3977b48b2e7782/products/1778443088623-ef93bb87-4bdf-42a7-9424-32703f9c7761-1777965637265-AA4E7C8F-C926-4607-B96F-A90693A7838E.jpg";

const logBlock = (title, payload) => {
  console.log(`\n${"=".repeat(72)}\n[test-ai-flow] ${title}\n${"=".repeat(72)}`);
  if (payload !== undefined) {
    console.log(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const guessMime = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
};

const downloadToTemp = async (url, suffix) => {
  logBlock("DOWNLOAD", { url, suffix });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed HTTP ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const filePath = path.join(os.tmpdir(), `ai-flow-test-${Date.now()}${suffix}`);
  fs.writeFileSync(filePath, buf);
  logBlock("DOWNLOAD OK", { filePath, bytes: buf.length });
  return filePath;
};

const resolveLocalFile = async (envPath, envUrl, suffix) => {
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  const url = envUrl || (suffix === ".mp4" ? DEFAULT_VIDEO_URL : DEFAULT_PRODUCT_URL);
  return downloadToTemp(url, suffix);
};

const api = async (method, route, { token, json, formData } = {}) => {
  const url = `${API_BASE_URL}${route}`;
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (json) {
    headers["Content-Type"] = "application/json";
  }

  const init = { method, headers };
  if (json) {
    init.body = JSON.stringify(json);
  } else if (formData) {
    init.body = formData;
  }

  logBlock(`${method} REQUEST`, { url, headers: token ? { Authorization: "Bearer ***" } : headers, body: json || "(multipart)" });

  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  logBlock(`${method} RESPONSE ${res.status}`, body);

  if (!res.ok) {
    const msg = body?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(`${method} ${route} failed: ${msg}`);
  }
  return body;
};

const login = async () => {
  if (process.env.ACCESS_TOKEN) {
    assertAccessToken(process.env.ACCESS_TOKEN);
    logBlock("AUTH", "Using ACCESS_TOKEN from env");
    return process.env.ACCESS_TOKEN;
  }

  const phone = process.env.TEST_PHONE;
  const otp = process.env.TEST_OTP;
  if (!phone || !otp) {
    throw new Error("Set ACCESS_TOKEN or both TEST_PHONE and TEST_OTP");
  }

  await api("POST", "/api/v1/auth/user/send-otp", { json: { phone } });

  const url = `${API_BASE_URL}/api/v1/auth/user/verify-otp`;
  const verifyRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, otp }),
  });
  const verifyText = await verifyRes.text();
  let verified;
  try {
    verified = verifyText ? JSON.parse(verifyText) : {};
  } catch {
    verified = { raw: verifyText };
  }
  logBlock(`POST RESPONSE ${verifyRes.status}`, verified);

  if (!verifyRes.ok || !verified?.success) {
    throw new Error(
      verified?.message ||
        "OTP verify failed — use the 6-digit code from SMS (not YOUR_SMS_CODE). " +
          "Verify within a few minutes and do not pm2 restart between send-otp and verify."
    );
  }

  const token = verified?.data?.token;
  if (!token) {
    throw new Error("OTP verify succeeded but no token in response");
  }
  return token;
};

const uploadMultipart = async (token, seriesId, route, filePath, fields) => {
  const buf = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: guessMime(filePath) }), path.basename(filePath));
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      form.append(k, String(v));
    }
  });
  return api("POST", `/api/v1/user/series/${seriesId}${route}`, { token, formData: form });
};

const buildSampleCallback = (series, jobId) => {
  const episode = (series.episodes || [])[0];
  if (!episode) {
    throw new Error("Series has no episodes for callback simulation");
  }
  return {
    jobId: jobId || series.aiJobId || "test-job-id",
    seriesId: String(series._id),
    status: "completed",
    episodes: [
      {
        episodeId: String(episode._id),
        clothing: [
          {
            category: "trousers",
            ranges: [{ start: 11, end: 12, bbox: [346, 864, 700, 1444] }],
          },
          {
            category: "dress",
            ranges: [{ start: 13, end: 14, bbox: [650, 1498, 727, 1689] }],
          },
        ],
        objects: [],
      },
    ],
  };
};

const run = async () => {
  logBlock("CONFIG", {
    API_BASE_URL,
    SIMULATE_CALLBACK,
    SKIP_AI_TRIGGER,
    VIDEO_PATH: process.env.VIDEO_PATH || "(download)",
    PRODUCT_IMAGE_PATH: process.env.PRODUCT_IMAGE_PATH || "(download)",
  });

  await api("GET", "/health");

  const token = await login();
  const videoPath = await resolveLocalFile(process.env.VIDEO_PATH, process.env.TEST_VIDEO_URL, ".mp4");
  const productPath = await resolveLocalFile(
    process.env.PRODUCT_IMAGE_PATH,
    process.env.TEST_PRODUCT_IMAGE_URL,
    ".jpg"
  );

  const created = await api("POST", "/api/v1/user/series", {
    token,
    json: {
      name: `AI Flow Test ${new Date().toISOString()}`,
      type: "micro_drama",
      episodeCount: 1,
      productCount: 1,
    },
  });

  const seriesId = created?.data?._id;
  if (!seriesId) {
    throw new Error("Series create did not return _id");
  }
  logBlock("SERIES CREATED", { seriesId });

  const afterEpisode = await uploadMultipart(token, seriesId, "/episodes/upload", videoPath, {
    title: "AI Flow Test Episode",
    order: 1,
  });

  const afterProduct = await uploadMultipart(token, seriesId, "/products/upload", productPath, {
    purchaseLink: "https://example.com/product",
    category: "clothing",
  });

  let series = afterProduct?.data || afterEpisode?.data;
  logBlock("UPLOADS DONE", {
    seriesId,
    episodes: (series?.episodes || []).map((ep) => ({
      episodeId: ep._id,
      videoUrl: ep.videoUrl,
    })),
    products: (series?.products || []).map((p) => ({
      productId: p._id,
      imageUrl: p.imageUrl,
      imageKey: p.imageKey,
    })),
  });

  let aiResult = null;
  if (!SKIP_AI_TRIGGER) {
    const submitted = await api("PATCH", `/api/v1/user/series/${seriesId}`, {
      token,
      json: { status: "submitted" },
    });
    series = submitted?.data || series;
    aiResult = {
      aiProcessingStatus: series?.aiProcessingStatus,
      aiJobId: series?.aiJobId,
      aiError: series?.aiError,
    };
    logBlock("AI TRIGGER (submit)", aiResult);
    await sleep(2000);

    try {
      const analyze = await api("POST", `/api/v1/user/series/${seriesId}/ai/analyze`, { token });
      aiResult = analyze?.data || aiResult;
      logBlock("AI TRIGGER (manual analyze)", aiResult);
    } catch (err) {
      logBlock("AI ANALYZE NOTE", err.message);
    }
  }

  if (SIMULATE_CALLBACK) {
    const refreshed = await api("GET", `/api/v1/user/series/${seriesId}`, { token });
    series = refreshed?.data || series;
    const callbackBody = buildSampleCallback(series, aiResult?.jobId || series?.aiJobId);
    logBlock("CALLBACK REQUEST BODY", callbackBody);

    const callbackRes = await api("POST", "/api/v1/internal/ai/product-cues/callback", {
      json: callbackBody,
    });
    logBlock("CALLBACK APPLIED", callbackRes?.data);

    const finalSeries = await api("GET", `/api/v1/user/series/${seriesId}`, { token });
    const ep = (finalSeries?.data?.episodes || [])[0];
    logBlock("FINAL EPISODE CUES", {
      episodeId: ep?._id,
      cueCount: ep?.productCues?.length || 0,
      sampleCue: ep?.productCues?.[0],
      aiProcessingStatus: finalSeries?.data?.aiProcessingStatus,
    });
  }

  logBlock("DONE", {
    seriesId,
    checkServerLogs: "Watch backend stdout for [ai-ingest] AI OUTBOUND / AI CALLBACK blocks",
  });
};

run().catch((err) => {
  console.error("\n[test-ai-flow] FAILED:", err?.message || err);
  process.exit(1);
});
