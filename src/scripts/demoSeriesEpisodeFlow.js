#!/usr/bin/env node
/**
 * Demo series/episode AI flow — clothing + non-clothing products.
 *
 * Create series → upload episode video and product images to S3 (presign + PUT)
 * → register them → submit (backend POSTs the analyze job to the AI model)
 * → poll until the AI callback lands → write the full transcript to JSON.
 *
 * Run on EC2 (from backend repo root):
 *   bash scripts/demo-series-flow.sh
 *
 * Or directly:
 *   API_BASE_URL=https://api.unscene.in node src/scripts/demoSeriesEpisodeFlow.js
 *
 * Env:
 *   API_BASE_URL       API host (default https://api.unscene.in)
 *   ACCESS_TOKEN       Skip OTP login and use this JWT
 *   TEST_PHONE/TEST_OTP Demo login (default 9999999999 / 123456)
 *   DEMO_MEDIA_DIR     Folder holding video.mp4, shirt.png, earrings.png, headphones.png, specs.png
 *                      (default <backend>/demo-media)
 *   DEMO_VIDEO         Overrides the episode video — local path or https URL
 *   DEMO_PURCHASE_LINK Purchase link written on every product (default https://purchase.link/demo)
 *   SERIES_ID          Resume mode: skip create/upload, only re-trigger AI and poll
 *   SKIP_AI_TRIGGER    true = upload only, never call the AI model
 *   SIMULATE_CALLBACK  true = POST a sample detection callback instead of waiting for the model
 *   AI_WAIT_TIMEOUT_MS Poll budget in ms (default 300000)
 *   OUT_PATH           Result JSON path (default docs/fixtures/DEMO_SERIES_EPISODE_RESULT.json)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const BACKEND_DIR = path.resolve(__dirname, "../..");

const API_BASE_URL = (process.env.API_BASE_URL || "https://api.unscene.in").replace(/\/+$/, "");
const PURCHASE_LINK = process.env.DEMO_PURCHASE_LINK || "https://purchase.link/demo";
const PHONE = process.env.TEST_PHONE || "9999999999";
const OTP = process.env.TEST_OTP || "123456";
const SERIES_ID = (process.env.SERIES_ID || "").trim();
const SKIP_AI_TRIGGER = process.env.SKIP_AI_TRIGGER === "true";
const SIMULATE_CALLBACK = process.env.SIMULATE_CALLBACK === "true";
const POLL_TIMEOUT_MS = Number(process.env.AI_WAIT_TIMEOUT_MS) || 300000;
const POLL_INTERVAL_MS = Number(process.env.AI_POLL_INTERVAL_MS) || 10000;
const MEDIA_DIR = process.env.DEMO_MEDIA_DIR || path.join(BACKEND_DIR, "demo-media");
const OUT_PATH =
  process.env.OUT_PATH || path.join(BACKEND_DIR, "docs/fixtures/DEMO_SERIES_EPISODE_RESULT.json");

/** Used when no local video is available so the script still runs on a bare EC2 box. */
const FALLBACK_VIDEO_URL =
  "https://d1gq4x8e2l4u04.cloudfront.net/users/69f86e79a7cdeb44c6a9e441/series/69fe36c51f3977b48b2e7782/episodes/1778443081381-6e8cbb62-f03c-4cea-88c6-8ef8cb9f8c5c-vtoVideo.mp4";

const PRODUCTS = [
  { fileName: "shirt.png", envKey: "DEMO_PRODUCT_SHIRT", title: "Olive Overshirt", category: "clothing" },
  { fileName: "earrings.png", envKey: "DEMO_PRODUCT_EARRINGS", title: "Gold Pearl Earrings", category: "non-clothing" },
  { fileName: "headphones.png", envKey: "DEMO_PRODUCT_HEADPHONES", title: "Sony WH-CH520 Headphones", category: "non-clothing" },
  { fileName: "specs.png", envKey: "DEMO_PRODUCT_SPECS", title: "Clear Frame Eyeglasses", category: "non-clothing" },
];

const transcript = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isUrl = (v) => /^https?:\/\//i.test(String(v || ""));

const SECRET_KEYS = new Set(["token", "accessToken", "refreshToken", "authorization"]);

/** The transcript is committed to the repo — keep JWTs and signed URLs out of it. */
const redact = (value) => {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => {
        if (SECRET_KEYS.has(k)) return [k, "<redacted>"];
        if (k === "uploadUrl" && typeof v === "string") return [k, `${v.split("?")[0]}?<signed>`];
        return [k, redact(v)];
      })
    );
  }
  return value;
};

const record = (rawEntry) => {
  const entry = redact(rawEntry);
  transcript.push({ at: new Date().toISOString(), ...entry });
  console.log(`\n--- ${entry.step} ---`);
  if (entry.request) console.log("request:", JSON.stringify(entry.request, null, 2));
  if (entry.response !== undefined) console.log("response:", JSON.stringify(entry.response, null, 2));
};

const mime = (file) => {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
};

const downloadToTemp = async (url, fileName) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed HTTP ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const filePath = path.join(os.tmpdir(), `demo-flow-${Date.now()}-${fileName}`);
  fs.writeFileSync(filePath, buf);
  record({ step: `download.${fileName}`, request: { url }, response: { filePath, bytes: buf.length } });
  return filePath;
};

/** env override (path or URL) → DEMO_MEDIA_DIR/<fileName> → fallback URL. */
const resolveMedia = async (fileName, envKey, fallbackUrl) => {
  const override = (process.env[envKey] || "").trim();
  if (override) {
    return isUrl(override) ? downloadToTemp(override, fileName) : override;
  }
  const local = path.join(MEDIA_DIR, fileName);
  if (fs.existsSync(local)) return local;
  if (fallbackUrl) {
    console.warn(`[demo-flow] ${fileName} not found in ${MEDIA_DIR} — using fallback URL`);
    return downloadToTemp(fallbackUrl, fileName);
  }
  throw new Error(`Missing media: put ${fileName} in ${MEDIA_DIR} or set ${envKey} to a path/URL`);
};

const api = async (step, method, route, { token, json } = {}) => {
  const url = `${API_BASE_URL}${route}`;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers["Content-Type"] = "application/json";

  const res = await fetch(url, { method, headers, body: json ? JSON.stringify(json) : undefined });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  record({ step, request: { method, url, body: json ?? null }, status: res.status, response: body });

  if (!res.ok) {
    throw new Error(`${step} failed HTTP ${res.status}: ${body?.message || body?.error || text}`);
  }
  return body;
};

const login = async () => {
  const preset = (process.env.ACCESS_TOKEN || "").trim();
  if (preset && preset.split(".").length === 3) {
    console.log("[demo-flow] using ACCESS_TOKEN from env");
    return preset;
  }
  await api("auth.send-otp", "POST", "/api/v1/auth/user/send-otp", { json: { phone: PHONE } });
  const verified = await api("auth.verify-otp", "POST", "/api/v1/auth/user/verify-otp", {
    json: { phone: PHONE, otp: OTP },
  });
  const token = verified?.data?.token;
  if (!token) throw new Error("verify-otp returned no token");
  return token;
};

const uploadAsset = async (token, seriesId, assetType, filePath, fileName) => {
  const contentType = mime(filePath);
  const presign = await api(`presign.${fileName}`, "POST", `/api/v1/user/series/${seriesId}/upload/presign`, {
    token,
    json: { assetType, fileName, contentType },
  });

  const uploadUrl = presign?.data?.uploadUrl;
  const key = presign?.data?.key;
  if (!uploadUrl || !key) throw new Error("presign response missing uploadUrl/key");

  const buf = fs.readFileSync(filePath);
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: buf });
  record({
    step: `s3.put.${fileName}`,
    request: { method: "PUT", url: `${uploadUrl.split("?")[0]}?<signed>`, bytes: buf.length, contentType },
    status: put.status,
    response: put.ok ? "(empty 200)" : await put.text(),
  });
  if (!put.ok) throw new Error(`S3 PUT failed HTTP ${put.status} for ${fileName}`);

  return key;
};

/** Same fields buildAnalyzePayload() sends to {AI_SERVICE_URL}/v1/analyze/jobs. */
const rebuildAnalyzePayload = (series) => ({
  jobId: series?.aiJobId || "",
  seriesId: String(series?._id || ""),
  callbackUrl: "https://api.unscene.in/api/v1/internal/ai/product-cues/callback",
  episodes: (series?.episodes || [])
    .filter((ep) => ep.videoUrl)
    .map((ep) => ({
      episodeId: String(ep._id),
      title: ep.title || "",
      videoUrl: ep.videoUrl,
      ...(Number(ep.order) > 0 ? { order: Number(ep.order) } : {}),
      ...(ep.videoKey ? { videoKey: ep.videoKey } : {}),
    })),
  products: (series?.products || []).map((p) => ({
    productId: String(p._id),
    title: p.title || "",
    imageUrl: p.imageUrl,
    purchaseLink: p.purchaseLink || "",
    category: p.category,
    ...(p.imageKey ? { imageKey: p.imageKey } : {}),
  })),
});

const buildSampleCallback = (series) => {
  const episode = (series?.episodes || [])[0];
  const byCategory = (cat) => (series?.products || []).filter((p) => p.category === cat);
  const clothing = byCategory("clothing");
  const objects = byCategory("non-clothing");
  const labels = ["earrings", "headphones", "glasses"];

  return {
    jobId: series?.aiJobId || "simulated-job",
    seriesId: String(series?._id),
    status: "completed",
    episodes: [
      {
        episodeId: String(episode?._id),
        clothing: clothing.map((p, i) => ({
          category: "shirt",
          productId: String(p._id),
          ranges: [{ start: 2 + i * 3, end: 2.4 + i * 3, bbox: [118, 205, 486, 902] }],
        })),
        objects: objects.map((p, i) => ({
          category: labels[i] || "object",
          productId: String(p._id),
          ranges: [{ start: 5 + i * 3, end: 5.4 + i * 3, bbox: [302, 178, 358, 262] }],
        })),
      },
    ],
  };
};

const createAndUpload = async (token) => {
  const videoPath = await resolveMedia("video.mp4", "DEMO_VIDEO", FALLBACK_VIDEO_URL);
  const productPaths = [];
  for (const p of PRODUCTS) {
    productPaths.push({ ...p, filePath: await resolveMedia(p.fileName, p.envKey, null) });
  }

  const created = await api("series.create", "POST", "/api/v1/user/series", {
    token,
    json: {
      name: `Demo Shoppable Series ${new Date().toISOString().slice(0, 16)}`,
      type: "micro_drama",
      episodeCount: 1,
      productCount: PRODUCTS.length,
    },
  });
  const seriesId = created?.data?._id;
  if (!seriesId) throw new Error("series create returned no _id");

  const videoKey = await uploadAsset(token, seriesId, "episode", videoPath, "video.mp4");
  await api("episode.register", "POST", `/api/v1/user/series/${seriesId}/episodes`, {
    token,
    json: { title: "Demo Episode 1", order: 1, videoKey },
  });

  for (const p of productPaths) {
    const imageKey = await uploadAsset(token, seriesId, "product", p.filePath, p.fileName);
    await api(`product.register.${p.fileName}`, "POST", `/api/v1/user/series/${seriesId}/products`, {
      token,
      json: { title: p.title, purchaseLink: PURCHASE_LINK, category: p.category, imageKey },
    });
  }

  return seriesId;
};

const writeResult = (seriesId, series) => {
  const episode = (series?.episodes || [])[0];
  const result = {
    generatedAt: new Date().toISOString(),
    apiBaseUrl: API_BASE_URL,
    aiEndpoint: "{AI_SERVICE_URL}/v1/analyze/jobs",
    callbackUrl: "https://api.unscene.in/api/v1/internal/ai/product-cues/callback",
    purchaseLink: PURCHASE_LINK,
    seriesId,
    aiProcessingStatus: series?.aiProcessingStatus,
    aiJobId: series?.aiJobId,
    aiError: series?.aiError,
    aiRequestedAt: series?.aiRequestedAt,
    aiCompletedAt: series?.aiCompletedAt,
    analyzeJobRequestSentToAiModel: rebuildAnalyzePayload(series),
    storedEpisodeCues: {
      episodeId: episode?._id,
      cueCount: episode?.productCues?.length || 0,
      timestampJsonUrl: episode?.timestampJsonUrl,
      productCues: episode?.productCues || [],
    },
    finalSeries: series,
    transcript,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), "utf8");
  return result;
};

const run = async () => {
  console.log("[demo-flow] config", {
    API_BASE_URL,
    MEDIA_DIR,
    PURCHASE_LINK,
    SERIES_ID: SERIES_ID || "(new series)",
    SKIP_AI_TRIGGER,
    SIMULATE_CALLBACK,
  });

  await api("health", "GET", "/health");
  const token = await login();

  const seriesId = SERIES_ID || (await createAndUpload(token));

  if (!SKIP_AI_TRIGGER) {
    if (SERIES_ID) {
      await api("series.ai.analyze", "POST", `/api/v1/user/series/${seriesId}/ai/analyze`, { token });
    } else {
      await api("series.submit", "PATCH", `/api/v1/user/series/${seriesId}`, {
        token,
        json: { status: "submitted" },
      });
    }
  }

  let series = (await api("series.get", "GET", `/api/v1/user/series/${seriesId}`, { token }))?.data;

  if (SIMULATE_CALLBACK) {
    await api("ai.callback.simulated", "POST", "/api/v1/internal/ai/product-cues/callback", {
      json: buildSampleCallback(series),
    });
  } else if (!SKIP_AI_TRIGGER) {
    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      series = (await api("series.poll", "GET", `/api/v1/user/series/${seriesId}`, { token }))?.data || series;
      const st = series?.aiProcessingStatus;
      const cues = (series?.episodes || [])[0]?.productCues?.length || 0;
      console.log(`[poll] ai=${st} cues=${cues} elapsed=${Math.round((Date.now() - start) / 1000)}s`);
      if (["completed", "failed", "skipped"].includes(st)) break;
    }
  }

  series = (await api("series.get.final", "GET", `/api/v1/user/series/${seriesId}`, { token }))?.data || series;
  const result = writeResult(seriesId, series);

  console.log("\n=== DONE ===");
  console.log(`seriesId:           ${seriesId}`);
  console.log(`aiProcessingStatus: ${result.aiProcessingStatus}`);
  console.log(`aiJobId:            ${result.aiJobId}`);
  console.log(`cues stored:        ${result.storedEpisodeCues.cueCount}`);
  console.log(`saved:              ${OUT_PATH}`);
};

run().catch((err) => {
  console.error("\n[demo-flow] FAILED:", err?.message || err);
  try {
    fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
    fs.writeFileSync(
      OUT_PATH,
      JSON.stringify({ failedAt: new Date().toISOString(), error: String(err?.message || err), transcript }, null, 2),
      "utf8"
    );
    console.error(`[demo-flow] partial transcript saved: ${OUT_PATH}`);
  } catch {}
  process.exit(1);
});
