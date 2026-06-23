/**
 * Set thumbnail image for Play Store demo series (phone 9999999999).
 *
 * Env: MONGO_URI, AWS_*, SEED_THUMBNAIL_PATH (optional)
 *
 * Run: npm run seed:demo-thumbnail
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const connectDb = require("../config/db");
const Series = require("../modules/series/series.model");
const User = require("../modules/user/user.model");
const { normalizePhoneForDb } = require("../common/utils/phone");
const { uploadBufferToS3 } = require("../common/services/s3.service");

const DEFAULT_SERIES_ID = "6a0e9fdc07e2100e7b9e44b4";
const DEFAULT_IMAGE =
  process.platform === "win32"
    ? "C:/Users/PushkarLS68/.cursor/projects/c-Users-PushkarLS68-Desktop-unsceneAi/assets/c__Users_PushkarLS68_AppData_Roaming_Cursor_User_workspaceStorage_083dfee280c05f78cb1a20452f00ef5f_images_WhatsApp_Image_2026-05-21_at_12.01.44_PM-efa820f3-55dd-45fb-9e27-28374a366822.png"
    : path.resolve(__dirname, "../assets/demo-series-thumbnail.png");

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const run = async () => {
  await connectDb();

  const imagePath = (process.env.SEED_THUMBNAIL_PATH || DEFAULT_IMAGE).trim();
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Thumbnail image not found: ${imagePath}`);
  }

  let series = null;
  const seriesId = process.env.SEED_SERIES_ID?.trim();
  if (seriesId && mongoose.isValidObjectId(seriesId)) {
    series = await Series.findById(seriesId);
  } else {
    const phone = normalizePhoneForDb(process.env.SEED_DEMO_PHONE || "9999999999").slice(-10);
    const user = await User.findOne({ phone });
    if (!user) {
      throw new Error(`Demo user not found for phone ${phone}`);
    }
    series = await Series.findOne({
      user: user._id,
      name: process.env.SEED_SERIES_NAME || "Unscene Demo Series",
    });
  }

  if (!series) {
    throw new Error("Demo series not found");
  }

  const userId = String(series.user);
  const sid = String(series._id);
  const ext = path.extname(imagePath).toLowerCase() || ".png";
  const contentType = MIME[ext] || "image/png";

  const buf = fs.readFileSync(imagePath);
  const { key, publicUrl } = await uploadBufferToS3({
    folder: `users/${userId}/series/${sid}/thumbnail`,
    fileName: `cover${ext}`,
    contentType,
    body: buf,
  });

  series.thumbnailKey = key;
  series.thumbnailUrl = publicUrl;
  await series.save();

  console.log("seedDemoSeriesThumbnail ok", {
    seriesId: sid,
    userId,
    name: series.name,
    thumbnailUrl: publicUrl,
    bytes: buf.length,
  });

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error("seedDemoSeriesThumbnail failed", err);
  mongoose.disconnect().finally(() => process.exit(1));
});
