const mongoose = require("mongoose");

const analyticsEventSchema = new mongoose.Schema(
  {
    eventType: { type: String, required: true, trim: true, index: true },
    /** Client-supplied idempotency key (UUID). */
    eventId: { type: String, trim: true, sparse: true, unique: true },
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: "Series", index: true },
    episodeId: { type: mongoose.Schema.Types.ObjectId, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    sessionId: { type: String, trim: true, index: true },
    deviceId: { type: String, trim: true },
    platform: { type: String, trim: true },
    clientVersion: { type: String, trim: true },
    /** Extra numeric/context fields from clients (e.g. watchPercent, durationSeconds). */
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

analyticsEventSchema.index({ seriesId: 1, eventType: 1, createdAt: -1 });
analyticsEventSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AnalyticsEvent", analyticsEventSchema);
