const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    source: {
      type: String,
      enum: ["admin"],
      default: "admin",
    },
    sentByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    /** Groups rows created in one admin send (broadcast or batch). */
    broadcastId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
