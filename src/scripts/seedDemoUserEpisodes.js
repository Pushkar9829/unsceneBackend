/**
 * Upload local MP4s to S3 and attach as episodes on the Play Store demo user.
 *
 * Env:
 *   MONGO_URI, AWS_* (see s3.service)
 *   SEED_DEMO_PHONE — default 9999999999 (12-digit 999… is normalized to last 10)
 *   SEED_VIDEO_DIR — default ~/Downloads
 *   SEED_SERIES_NAME — default "Unscene Demo Series"
 *   SEED_REPLACE_SERIES — if "true", delete existing series with same name first
 *
 * Run: npm run seed:demo-episodes
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const mongoose = require("mongoose");
const connectDb = require("../config/db");
const env = require("../config/env");
const { normalizePhoneForDb } = require("../common/utils/phone");
const User = require("../modules/user/user.model");
const Series = require("../modules/series/series.model");
const Genre = require("../modules/genre/genre.model");
const { uploadBufferToS3, getPublicFileUrl } = require("../common/services/s3.service");

const MIME_MP4 = "video/mp4";

/** Playback order in the app */
const EPISODE_FILES = [
  { file: "Trailer.mp4", title: "Trailer", order: 0 },
  { file: "E1.mp4", title: "Episode 1", order: 1 },
  { file: "E2.mp4", title: "Episode 2", order: 2 },
  { file: "E3.mp4", title: "Episode 3", order: 3 },
  { file: "E4.mp4", title: "Episode 4", order: 4 },
  { file: "E5.mp4", title: "Episode 5", order: 5 },
  { file: "E6.mp4", title: "Episode 6", order: 6 },
  { file: "Choice 1.mp4", title: "Choice 1", order: 7 },
  { file: "Choice 2.mp4", title: "Choice 2", order: 8 },
];

const resolveDemoPhone = () => {
  const raw = (process.env.SEED_DEMO_PHONE || env.demoPhone || "9999999999").trim();
  let phone = normalizePhoneForDb(raw);
  if (phone.length > 10) {
    phone = phone.slice(-10);
  }
  if (!/^[6-9]\d{9}$/.test(phone)) {
    throw new Error(`Invalid demo phone after normalize: ${phone}`);
  }
  return phone;
};

const videoDir = () => {
  const dir = (process.env.SEED_VIDEO_DIR || path.join(os.homedir(), "Downloads")).trim();
  if (!fs.existsSync(dir)) {
    throw new Error(`SEED_VIDEO_DIR not found: ${dir}`);
  }
  return dir;
};

const uploadLocalVideo = async (folder, absolutePath) => {
  const buf = fs.readFileSync(absolutePath);
  const base = path.basename(absolutePath);
  const { key, publicUrl } = await uploadBufferToS3({
    folder,
    fileName: base,
    contentType: MIME_MP4,
    body: buf,
  });
  return { key, publicUrl, fileName: base, bytes: buf.length };
};

const run = async () => {
  await connectDb();

  const phone = resolveDemoPhone();
  const seriesName = (process.env.SEED_SERIES_NAME || "Unscene Demo Series").trim();
  const dir = videoDir();

  for (const ep of EPISODE_FILES) {
    const p = path.join(dir, ep.file);
    if (!fs.existsSync(p)) {
      throw new Error(`Missing video: ${p}`);
    }
  }

  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({ phone, name: "Play Store Demo" });
    console.log("[seed] Created demo user", { userId: user._id, phone });
  } else {
    console.log("[seed] Found demo user", { userId: user._id, phone });
  }

  const userId = String(user._id);

  if (process.env.SEED_REPLACE_SERIES === "true") {
    const deleted = await Series.deleteMany({ user: userId, name: seriesName });
    if (deleted.deletedCount) {
      console.log("[seed] Removed prior series", { count: deleted.deletedCount, seriesName });
    }
  }

  let series = await Series.findOne({ user: userId, name: seriesName });
  if (!series) {
    const genre = await Genre.findOne({ isActive: true }).sort({ name: 1 });
    series = await Series.create({
      user: userId,
      name: seriesName,
      type: "micro_drama",
      genreId: genre?._id,
      genreName: genre?.name || "Drama",
      status: "submitted",
      catalogHidden: false,
      featured: true,
      episodes: [],
      products: [],
      episodeCount: EPISODE_FILES.length,
      productCount: 0,
    });
    console.log("[seed] Created series", { seriesId: series._id, seriesName });
  } else {
    series.episodes = [];
    series.status = "submitted";
    series.catalogHidden = false;
    series.featured = true;
    series.episodeCount = EPISODE_FILES.length;
    await series.save();
    console.log("[seed] Reset episodes on existing series", { seriesId: series._id });
  }

  const seriesId = String(series._id);
  const episodeFolder = `users/${userId}/series/${seriesId}/episodes`;
  const thumbFolder = `users/${userId}/series/${seriesId}/thumbnail`;

  const trailerPath = path.join(dir, "Trailer.mp4");
  const thumbUploaded = await uploadLocalVideo(thumbFolder, trailerPath);
  series.thumbnailKey = thumbUploaded.key;
  series.thumbnailUrl = thumbUploaded.publicUrl;

  const uploadedEpisodes = [];
  for (const spec of EPISODE_FILES) {
    const absolutePath = path.join(dir, spec.file);
    console.log("[seed] Uploading", spec.file, "...");
    const up = await uploadLocalVideo(episodeFolder, absolutePath);
    uploadedEpisodes.push({
      title: spec.title,
      order: spec.order,
      videoKey: up.key,
      videoUrl: up.publicUrl,
      productCues: [],
    });
    console.log("[seed] Uploaded", spec.file, `${(up.bytes / 1e6).toFixed(1)} MB`, up.publicUrl);
  }

  uploadedEpisodes.sort((a, b) => a.order - b.order);
  series.set("episodes", uploadedEpisodes);
  series.episodeCount = uploadedEpisodes.length;
  series.markModified("episodes");
  await series.save();

  console.log("seedDemoUserEpisodes ok", {
    phone,
    userId,
    seriesId,
    seriesName,
    episodeCount: series.episodes.length,
    thumbnailUrl: series.thumbnailUrl,
    episodes: series.episodes.map((e) => ({
      order: e.order,
      title: e.title,
      videoUrl: e.videoUrl,
    })),
  });

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("seedDemoUserEpisodes failed", err);
  mongoose.disconnect().finally(() => process.exit(1));
});
