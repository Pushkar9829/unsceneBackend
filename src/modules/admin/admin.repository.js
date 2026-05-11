const Admin = require("./admin.model");

const findAdminByEmail = (email) => {
  return Admin.findOne({ email: email.toLowerCase() });
};

const findAdminById = (id) => {
  return Admin.findById(id).select("-passwordHash -__v");
};

const updateAdminById = (id, payload) => {
  return Admin.findByIdAndUpdate(id, payload, { new: true, runValidators: true }).select(
    "-passwordHash -__v"
  );
};

const createAdmin = (payload) => Admin.create(payload);

const incrementAdminTokenVersion = (id) =>
  Admin.findByIdAndUpdate(id, { $inc: { tokenVersion: 1 } }, { new: true }).select("tokenVersion");

module.exports = {
  findAdminByEmail,
  findAdminById,
  updateAdminById,
  createAdmin,
  incrementAdminTokenVersion,
};
