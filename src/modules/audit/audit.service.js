const AdminAudit = require("./adminAudit.model");

const appendAudit = async ({ actorAdminId, action, targetType, targetId, details }) =>
  AdminAudit.create({
    actorAdminId,
    action,
    targetType: targetType || "",
    targetId: targetId != null ? String(targetId) : "",
    details: details && typeof details === "object" ? details : {},
  });

const listAudits = async ({
  actorAdminId,
  targetType,
  targetId,
  from,
  to,
  skip,
  limit,
}) => {
  const filter = {};
  if (actorAdminId) filter.actorAdminId = actorAdminId;
  if (targetType) filter.targetType = targetType;
  if (targetId) filter.targetId = String(targetId);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const [items, total] = await Promise.all([
    AdminAudit.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AdminAudit.countDocuments(filter),
  ]);
  return { items, total };
};

module.exports = {
  appendAudit,
  listAudits,
};
