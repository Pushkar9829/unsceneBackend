const { findAdminById } = require("./admin.repository");

const getAdminProfile = async (id) => {
  const admin = await findAdminById(id);
  if (!admin) {
    throw new Error("Admin not found");
  }
  return admin;
};

module.exports = {
  getAdminProfile,
};
