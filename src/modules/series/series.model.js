const mongoose = require("mongoose");
const { SERIES_TYPES, AI_PROCESSING_STATUS } = require("../../config/constants");

/**
 * Shoppable cue: shown in the video player when playback reaches timestampSeconds.
 * Populated from your ingest/API (timestamp + image + purchase link).
 */
const episodeProductCueSchema = new mongoose.Schema(
  {
    /** Playback position in seconds (integer or fractional). */
    timestampSeconds: { type: Number, required: true, min: 0 },
    purchaseLink: { type: String, trim: true, default: "" },
    imageUrl: { type: String, trim: true, required: true },
    imageKey: { type: String, trim: true, default: "" },
    title: { type: String, trim: true, default: "" },
    /**
     * Optional reference to an entry in series.products (same series document).
     * Not a Mongoose ref — validated in service against existing product _id.
     */
    seriesProductId: { type: mongoose.Schema.Types.ObjectId, default: undefined },
    /** How long this cue stays visible (seconds). Omit for app default (1s slot). */
    displayDurationSeconds: { type: Number, min: 0.1, max: 600, default: undefined },
    /** End of visibility window (seconds). When set, player shows overlay until this time. */
    endTimestampSeconds: { type: Number, min: 0, default: undefined },
    /** Pixel bbox on source video frame [x1, y1, x2, y2] for on-frame overlays. */
    bbox: {
      type: [Number],
      default: undefined,
      validate: {
        validator(v) {
          return v == null || (Array.isArray(v) && v.length === 4 && v.every((n) => Number.isFinite(n)));
        },
        message: "bbox must be [x1, y1, x2, y2]",
      },
    },
    /** AI detection label (e.g. trousers, dress). */
    detectionCategory: { type: String, trim: true, default: "" },
    /** AI detection group: clothing | object. */
    detectionType: { type: String, enum: ["clothing", "object"], default: undefined },
  },
  { _id: false }
);

const episodeEntrySchema = new mongoose.Schema(
  {
    order: { type: Number, default: 0 },
    title: { type: String, trim: true, default: "" },
    videoKey: { type: String, required: true },
    videoUrl: { type: String, required: true },
    /** In-player shop cues (preferred). Sorted by timestampSeconds when saved. */
    productCues: { type: [episodeProductCueSchema], default: [] },
    /** S3 object key for optional cue/timestamp JSON (per episode). */
    timestampJsonKey: { type: String, trim: true },
    /** CloudFront or S3 URL for the timestamp JSON file. */
    timestampJsonUrl: { type: String, trim: true },
    /** Operator-only: hide episode from players without deleting media. */
    adminDisabled: { type: Boolean, default: false },
  },
  { _id: true }
);

const productEntrySchema = new mongoose.Schema(
  {
    purchaseLink: { type: String, trim: true, default: "" },
    imageKey: { type: String, required: true },
    imageUrl: { type: String, required: true },
    category: {
      type: String,
      enum: ["clothing", "non-clothing"],
      required: true,
    },
  },
  { _id: true }
);

const seriesSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: SERIES_TYPES,
      default: "micro_drama",
      index: true,
    },
    name: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    genreId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Genre",
      index: true,
    },
    genreName: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    thumbnailKey: { type: String, trim: true, default: "" },
    thumbnailUrl: { type: String, trim: true, default: "" },
    episodeCount: { type: Number, min: 0 },
    productCount: { type: Number, min: 0 },
    episodes: [episodeEntrySchema],
    products: [productEntrySchema],
    status: {
      type: String,
      enum: ["draft", "submitted"],
      default: "draft",
    },
    moderationNotes: { type: String, trim: true, default: "" },
    featured: { type: Boolean, default: false, index: true },
    /** When true, series stays submitted but is omitted from public catalogue & favorites resolution. */
    catalogHidden: { type: Boolean, default: false, index: true },
    /** Product-cue AI ingest lifecycle (see backend/docs/AI_INGEST_BACKEND.md). */
    aiProcessingStatus: {
      type: String,
      enum: Object.values(AI_PROCESSING_STATUS),
      default: AI_PROCESSING_STATUS.IDLE,
      index: true,
    },
    aiJobId: { type: String, trim: true, default: "" },
    aiError: { type: String, trim: true, default: "" },
    aiRequestedAt: { type: Date },
    aiCompletedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Series", seriesSchema);
