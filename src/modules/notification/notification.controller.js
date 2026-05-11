const { successResponse, errorResponse } = require("../../common/utils/response");
const { listNotifications, getUnreadCount } = require("./notification.service");

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

module.exports = {
  list,
  unreadCount,
};

