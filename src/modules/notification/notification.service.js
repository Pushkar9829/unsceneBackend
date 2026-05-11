const parsePaging = (query) => {
  const page = Math.max(1, Number(query?.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

/**
 * Placeholder implementation.
 * This unblocks client calls that currently 404 because routes don't exist yet.
 */
const listNotifications = async (userId, query) => {
  const { page, limit } = parsePaging(query);
  return {
    items: [],
    page,
    limit,
  };
};

/** Placeholder unread count (0). */
const getUnreadCount = async (userId) => {
  return 0;
};

module.exports = {
  listNotifications,
  getUnreadCount,
};

