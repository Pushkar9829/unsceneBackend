const mongoose = require("mongoose");
const { ROLES } = require("../../config/constants");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    username: {
      type: String,
      trim: true,
    },
    bio: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    /** Stored as DD/MM/YYYY or ISO date string */
    dateOfBirth: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    role: {
      type: String,
      default: ROLES.USER,
      enum: [ROLES.USER],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    /** Incremented on logout to invalidate access + refresh tokens. */
    tokenVersion: {
      type: Number,
      default: 0,
    },
    profileImageUrl: {
      type: String,
      trim: true,
    },
    profileImageKey: {
      type: String,
      trim: true,
    },
    /** Series the user saved from the public catalog (order = most recently added last). */
    favoriteSeries: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Series" }],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
