const User = require("./user.model");

const findUserByPhone = (phone) => User.findOne({ phone });

const createUser = (payload) => User.create(payload);

const findUserById = (id) => User.findById(id).select("-__v");
const updateUserById = (id, payload) =>
  User.findByIdAndUpdate(id, payload, { new: true, runValidators: true }).select("-__v");

const incrementUserTokenVersion = (id) =>
  User.findByIdAndUpdate(id, { $inc: { tokenVersion: 1 } }, { new: true }).select("tokenVersion");

const findFavoriteSeriesIds = (userId) =>
  User.findById(userId).select("favoriteSeries").lean();

const addFavoriteSeriesId = (userId, seriesObjectId) =>
  User.findByIdAndUpdate(
    userId,
    { $addToSet: { favoriteSeries: seriesObjectId } },
    { new: true, runValidators: true }
  ).select("-__v");

const removeFavoriteSeriesId = (userId, seriesObjectId) =>
  User.findByIdAndUpdate(
    userId,
    { $pull: { favoriteSeries: seriesObjectId } },
    { new: true, runValidators: true }
  ).select("-__v");

const deleteUserById = (id) => User.findByIdAndDelete(id);

const countUsers = (filter = {}) => User.countDocuments(filter);

const adminListUsers = ({ filter, sortObj, skip, limit }) =>
  Promise.all([
    User.find(filter).sort(sortObj).skip(skip).limit(limit).select("-__v").lean(),
    User.countDocuments(filter),
  ]);

module.exports = {
  findUserByPhone,
  createUser,
  findUserById,
  updateUserById,
  incrementUserTokenVersion,
  findFavoriteSeriesIds,
  addFavoriteSeriesId,
  removeFavoriteSeriesId,
  deleteUserById,
  countUsers,
  adminListUsers,
};
