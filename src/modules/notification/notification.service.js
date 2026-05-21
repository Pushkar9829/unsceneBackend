const mongoose = require("mongoose");
const User = require("../user/user.model");
const { findUserById } = require("../user/user.repository");
const { appendAudit } = require("../audit/audit.service");
const {
  insertMany,
  listByUser,
  countUnreadByUser,
  markRead,
  markAllRead,
} = require("./notification.repository");

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const parsePaging = (query) => {
  const page = Math.max(1, Number(query?.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

const toClientItem = (row) => ({
  id: String(row._id),
  title: row.title || "",
  body: row.body,
  read: Boolean(row.readAt),
  readAt: row.readAt || null,
  createdAt: row.createdAt,
});

const listNotifications = async (userId, query) => {
  const { page, limit, skip } = parsePaging(query);
  const uid = new mongoose.Types.ObjectId(String(userId));
  const [rows, total] = await listByUser(uid, { skip, limit });
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  return {
    items: rows.map(toClientItem),
    page,
    limit,
    total,
    totalPages,
  };
};

const getUnreadCount = async (userId) => {
  const uid = new mongoose.Types.ObjectId(String(userId));
  return countUnreadByUser(uid);
};

const markNotificationRead = async (userId, notificationId) => {
  if (!mongoose.isValidObjectId(String(notificationId))) {
    throw httpError(400, "Invalid notification id");
  }
  const uid = new mongoose.Types.ObjectId(String(userId));
  const nid = new mongoose.Types.ObjectId(String(notificationId));
  const updated = await markRead(uid, nid);
  if (!updated) {
    throw httpError(404, "Notification not found");
  }
  return toClientItem(updated);
};

const markAllNotificationsRead = async (userId) => {
  const uid = new mongoose.Types.ObjectId(String(userId));
  await markAllRead(uid);
  return { unreadCount: 0 };
};

const resolveRecipientIds = async (userId) => {
  if (userId) {
    if (!mongoose.isValidObjectId(String(userId))) {
      throw httpError(400, "Invalid user id");
    }
    const user = await findUserById(userId);
    if (!user || user.isActive === false) {
      throw httpError(404, "User not found");
    }
    return [new mongoose.Types.ObjectId(String(userId))];
  }
  const users = await User.find({ isActive: { $ne: false } }).select("_id").lean();
  return users.map((u) => u._id);
};

/** Admin sends a notification to one user or all active users. */
const adminSendNotification = async (adminId, payload) => {
  const title = String(payload?.title ?? "").trim();
  const body = String(payload?.body ?? payload?.message ?? "").trim();
  if (!body) {
    throw httpError(400, "Notification message is required");
  }

  const recipientIds = await resolveRecipientIds(payload?.userId);
  if (recipientIds.length === 0) {
    throw httpError(400, "No active users to notify");
  }

  const broadcastId = new mongoose.Types.ObjectId();
  const adminOid = new mongoose.Types.ObjectId(String(adminId));
  const docs = recipientIds.map((userId) => ({
    userId,
    title,
    body,
    source: "admin",
    sentByAdminId: adminOid,
    broadcastId,
  }));

  const BATCH = 500;
  for (let i = 0; i < docs.length; i += BATCH) {
    await insertMany(docs.slice(i, i + BATCH));
  }

  await appendAudit({
    actorAdminId: adminId,
    action: payload?.userId ? "notification.send_user" : "notification.broadcast",
    targetType: "notification",
    targetId: String(broadcastId),
    details: {
      recipientCount: recipientIds.length,
      title,
      bodyPreview: body.slice(0, 120),
      userId: payload?.userId || null,
    },
  });

  return {
    broadcastId: String(broadcastId),
    recipientCount: recipientIds.length,
    title,
    body,
  };
};

module.exports = {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  adminSendNotification,
};
