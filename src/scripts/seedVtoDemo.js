/**
 * Uploads vto demo video + gallery images to S3, replaces episode media URLs,
 * rebuilds series.products + productCues (multi-product same timestamp + >1s display windows).
 *
 * Env:
 *   MONGO_URI — from backend .env
 *   AWS_* — bucket/keys/region/cloudfront per s3.service
 *   SEED_SERIES_ID (default: demo series below)
 *   SEED_VIDEO_PATH — absolute path to vtoVideo.mp4 (default: ~/Downloads/vtoVideo.mp4)
 *   SEED_IMAGE_DIR — folder containing the image files (optional; searches RN videoPlayer dirs)
 *
 * Run: npm run seed:vto-demo
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const mongoose = require("mongoose");
const connectDb = require("../config/db");
const Series = require("../modules/series/series.model");
const { uploadBufferToS3 } = require("../common/services/s3.service");

const DEFAULT_SERIES_ID = "69fe36c51f3977b48b2e7782";

const MIME = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/** Each slot is alternate filenames (first match wins). Order = product catalog order. */
const IMAGE_FILE_ALIASES = [
  ["1768918281077-IMG-20230821-WA0000.jpg"],
  ["1777965637265-AA4E7C8F-C926-4607-B96F-A90693A7838E.jpg"],
  ["b3801334-f401-4d92-b9cb-8a8d327427c8-41 (1).png"],
  ["b3801334-f401-4d92-b9cb-8a8d327427c8-41.png"],
  ["WhatsApp Image 2026-04-02 at 4.42.16 PM (1).jpeg", "WhatsApp Image 2026-04-02 at 4.42.16 PM (1).jpg"],
  ["WhatsApp Image 2026-04-02 at 4.42.16 PM.jpeg", "WhatsApp Image 2026-04-02 at 4.42.16 PM.jpg"],
];

const workspaceRoot = path.resolve(__dirname, "..", "..", "..");

const imageLookupRoots = () => {
  const extra = process.env.SEED_IMAGE_DIR?.trim();
  const roots = [
    extra,
    path.join(workspaceRoot, "unsceneAi", "src", "screens", "videoPlayer"),
    path.join(workspaceRoot, "unsceneAi", "unsceneAi", "src", "screens", "videoPlayer"),
    path.join(workspaceRoot, "src", "screens", "videoPlayer"),
  ].filter(Boolean);
  return [...new Set(roots)];
};

const resolveFirstExistingPath = (aliasGroup) => {
  const roots = imageLookupRoots();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const name of aliasGroup) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }
  return null;
};

const resolveVideoPath = () => {
  const fromEnv = process.env.SEED_VIDEO_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }
  const fallback = path.join(os.homedir(), "Downloads", "vtoVideo.mp4");
  return fs.existsSync(fallback) ? fallback : null;
};

const cue = (partial) => ({
  purchaseLink: "https://nznd",
  title: "Shop this look",
  ...partial,
});

const run = async () => {
  await connectDb();

  const seriesId = process.env.SEED_SERIES_ID?.trim() || DEFAULT_SERIES_ID;
  if (!mongoose.isValidObjectId(seriesId)) {
    throw new Error(`Invalid SEED_SERIES_ID: ${seriesId}`);
  }

  const series = await Series.findById(seriesId).exec();
  if (!series) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  const userId = String(series.user);
  const episodes = [...series.episodes].sort((a, b) => Number(a.order) - Number(b.order));
  if (!episodes.length) {
    throw new Error("Series has no episodes");
  }

  const videoPath = resolveVideoPath();
  if (!videoPath) {
    throw new Error(
      "Video not found. Set SEED_VIDEO_PATH to vtoVideo.mp4 or copy the file to ~/Downloads/vtoVideo.mp4"
    );
  }

  const resolvedImages = IMAGE_FILE_ALIASES.map((aliases) => {
    const p = resolveFirstExistingPath(aliases);
    return { aliases, absolutePath: p };
  });

  const missing = resolvedImages.filter((x) => !x.absolutePath);
  if (missing.length) {
    const hint = missing
      .map((m) => m.aliases[0])
      .join(", ");
    throw new Error(
      `Missing local image files: ${hint}. Copy them into RN videoPlayer folder or set SEED_IMAGE_DIR. Tried roots: ${imageLookupRoots().join(" | ")}`
    );
  }

  const productFolder = `users/${userId}/series/${seriesId}/products`;
  const episodeFolder = `users/${userId}/series/${seriesId}/episodes`;

  const uploadLocalFile = async (folder, absolutePath) => {
    const buf = fs.readFileSync(absolutePath);
    const base = path.basename(absolutePath);
    const ext = path.extname(base).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";
    const { key, publicUrl } = await uploadBufferToS3({
      folder,
      fileName: base,
      contentType,
      body: buf,
    });
    return { key, publicUrl };
  };

  const videoUploaded = await uploadLocalFile(episodeFolder, videoPath);

  const productUploads = [];
  for (const { absolutePath } of resolvedImages) {
    productUploads.push(await uploadLocalFile(productFolder, absolutePath));
  }

  /** @type {'clothing' | 'non-clothing'}[] */
  const categories = ["non-clothing", "clothing", "clothing", "clothing", "clothing", "clothing"];

  series.set(
    "products",
    productUploads.map((u, idx) => ({
      purchaseLink: "https://nznd",
      imageKey: u.key,
      imageUrl: u.publicUrl,
      category: categories[idx],
    }))
  );

  await series.save();

  const refreshed = await Series.findById(seriesId).exec();
  if (!refreshed) {
    throw new Error(`Series vanished after save: ${seriesId}`);
  }

  const p = refreshed.products;
  const pid = (idx) => p[idx]._id;

  refreshed.episodes.forEach((sub) => {
    sub.videoKey = videoUploaded.key;
    sub.videoUrl = videoUploaded.publicUrl;
  });

  refreshed.markModified("episodes");

  /** ~23s clip: clustered cues + displayDurationSeconds > 1 */
  const ep1Order1 = refreshed.episodes.find((e) => Number(e.order) === 1);
  const ep2Order2 = refreshed.episodes.find((e) => Number(e.order) === 2);

  if (ep1Order1) {
    ep1Order1.productCues = [
      cue({
        timestampSeconds: 3,
        displayDurationSeconds: 2,
        imageUrl: productUploads[0].publicUrl,
        imageKey: productUploads[0].key,
        seriesProductId: pid(0),
        title: "Accessory A",
      }),
      cue({
        timestampSeconds: 3,
        displayDurationSeconds: 2,
        imageUrl: productUploads[1].publicUrl,
        imageKey: productUploads[1].key,
        seriesProductId: pid(1),
        title: "Accessory B",
      }),
      cue({
        timestampSeconds: 8,
        displayDurationSeconds: 4,
        imageUrl: productUploads[2].publicUrl,
        imageKey: productUploads[2].key,
        seriesProductId: pid(2),
        title: "Look 4s",
      }),
      cue({
        timestampSeconds: 15,
        displayDurationSeconds: 2.5,
        imageUrl: productUploads[4].publicUrl,
        imageKey: productUploads[4].key,
        seriesProductId: pid(4),
        title: "Size shirt",
      }),
      cue({
        timestampSeconds: 15,
        displayDurationSeconds: 2.5,
        imageUrl: productUploads[5].publicUrl,
        imageKey: productUploads[5].key,
        seriesProductId: pid(5),
        title: "Size pant",
      }),
      cue({
        timestampSeconds: 20,
        displayDurationSeconds: 2,
        imageUrl: productUploads[3].publicUrl,
        imageKey: productUploads[3].key,
        seriesProductId: pid(3),
        title: "Studio look",
      }),
    ].sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  }

  if (ep2Order2) {
    ep2Order2.productCues = [
      cue({
        timestampSeconds: 4,
        displayDurationSeconds: 3,
        imageUrl: productUploads[0].publicUrl,
        imageKey: productUploads[0].key,
        seriesProductId: pid(0),
        title: "Dual range A",
      }),
      cue({
        timestampSeconds: 4,
        displayDurationSeconds: 3,
        imageUrl: productUploads[1].publicUrl,
        imageKey: productUploads[1].key,
        seriesProductId: pid(1),
        title: "Dual range B",
      }),
      cue({
        timestampSeconds: 11,
        displayDurationSeconds: 3,
        imageUrl: productUploads[2].publicUrl,
        imageKey: productUploads[2].key,
        seriesProductId: pid(2),
        title: "Single 3s",
      }),
      cue({
        timestampSeconds: 17,
        displayDurationSeconds: 2,
        imageUrl: productUploads[4].publicUrl,
        imageKey: productUploads[4].key,
        seriesProductId: pid(4),
        title: "Chart duo 1",
      }),
      cue({
        timestampSeconds: 17,
        displayDurationSeconds: 2,
        imageUrl: productUploads[5].publicUrl,
        imageKey: productUploads[5].key,
        seriesProductId: pid(5),
        title: "Chart duo 2",
      }),
      cue({
        timestampSeconds: 20.5,
        displayDurationSeconds: 2,
        imageUrl: productUploads[3].publicUrl,
        imageKey: productUploads[3].key,
        seriesProductId: pid(3),
        title: "Tail card",
      }),
    ].sort((a, b) => {
      const d = a.timestampSeconds - b.timestampSeconds;
      if (d !== 0) return d;
      const aid = String(a.seriesProductId);
      const bid = String(b.seriesProductId);
      return aid.localeCompare(bid);
    });
  }

  refreshed.productCount = p.length;

  refreshed.markModified("episodes");
  await refreshed.save();

  console.log("seedVtoDemo ok", {
    seriesId,
    videoUrl: videoUploaded.publicUrl,
    productCount: p.length,
    episodeUpdates: refreshed.episodes.map((e) => ({
      order: e.order,
      title: e.title,
      cues: e.productCues?.length ?? 0,
      videoUrl: e.videoUrl,
    })),
  });

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("seedVtoDemo failed", err);
  mongoose.disconnect().finally(() => process.exit(1));
});
