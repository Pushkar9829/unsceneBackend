const Notification = require("./notification.model");

const insertMany = (docs) => Notification.insertMany(docs, { ordered: false });

const listByUser = (userId, { skip = 0, limit = 20 }) =>
  Promise.all([
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-__v")
      .lean(),
    Notification.countDocuments({ userId }),
  ]);

const countUnreadByUser = (userId) =>
  Notification.countDocuments({ userId, readAt: null });

const markRead = (userId, notificationId) =>
  Notification.findOneAndUpdate(
    { _id: notificationId, userId, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true }
  )
    .select("-__v")
    .lean();

const markAllRead = (userId) =>
  Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });

const findByIdForUser = (userId, notificationId) =>
  Notification.findOne({ _id: notificationId, userId }).select("-__v").lean();

const deleteAllByUser = (userId) => Notification.deleteMany({ userId });

module.exports = {
  insertMany,
  listByUser,
  countUnreadByUser,
  markRead,
  markAllRead,
  findByIdForUser,
  deleteAllByUser,
};
