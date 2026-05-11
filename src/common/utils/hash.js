const bcrypt = require("bcryptjs");

const hashPassword = async (value) => {
  return bcrypt.hash(value, 10);
};

const comparePassword = async (value, hash) => {
  return bcrypt.compare(value, hash);
};

module.exports = {
  hashPassword,
  comparePassword,
};
