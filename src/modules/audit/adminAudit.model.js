const mongoose = require("mongoose");

const adminAuditSchema = new mongoose.Schema(
  {
    actorAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    action: { type: String, required: true, trim: true },
    targetType: { type: String, trim: true, index: true },
    targetId: { type: String, trim: true, index: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

adminAuditSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AdminAudit", adminAuditSchema);
