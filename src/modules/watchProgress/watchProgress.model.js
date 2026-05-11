const mongoose = require("mongoose");

/**
 * One row per user per series: current episode + playback position for resume.
 */
const watchProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    seriesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Series",
      required: true,
      index: true,
    },
    episodeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    /** Last playback position in seconds (fractional allowed). */
    positionSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Episode duration when progress was saved (optional, for UI percent). */
    durationSeconds: {
      type: Number,
      min: 0,
      default: undefined,
    },
    /** True when the user reached the end (or nearly complete). */
    completed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

watchProgressSchema.index({ userId: 1, seriesId: 1 }, { unique: true });
watchProgressSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model("WatchProgress", watchProgressSchema);
