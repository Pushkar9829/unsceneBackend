const { successResponse, errorResponse } = require("../../common/utils/response");
const {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  adminSendNotification,
} = require("./notification.service");

const statusFromError = (error, fallback) =>
  Number.isFinite(Number(error?.statusCode)) ? Number(error.statusCode) : fallback;

const list = async (req, res) => {
  try {
    const data = await listNotifications(req.user.id, req.query);
    return successResponse(res, data, "Notifications");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

const unreadCount = async (req, res) => {
  try {
    const data = await getUnreadCount(req.user.id);
    return successResponse(res, { unreadCount: data }, "Unread notifications count");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

const markRead = async (req, res) => {
  try {
    const data = await markNotificationRead(req.user.id, req.params.notificationId);
    return successResponse(res, data, "Notification marked as read");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

const markAllRead = async (req, res) => {
  try {
    const data = await markAllNotificationsRead(req.user.id);
    return successResponse(res, data, "All notifications marked as read");
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

const adminSend = async (req, res) => {
  try {
    const data = await adminSendNotification(req.user.id, req.body);
    return successResponse(res, data, "Notification sent", 201);
  } catch (error) {
    return errorResponse(res, error.message, statusFromError(error, 400));
  }
};

module.exports = {
  list,
  unreadCount,
  markRead,
  markAllRead,
  adminSend,
};
