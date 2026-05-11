const mongoose = require("mongoose");
const { ROLES } = require("../../config/constants");

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: ROLES.ADMIN,
      enum: [ROLES.ADMIN],
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", adminSchema);
