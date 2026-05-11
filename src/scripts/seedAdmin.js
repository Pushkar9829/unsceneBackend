const connectDb = require("../config/db");
const env = require("../config/env");
const { hashPassword } = require("../common/utils/hash");
const { findAdminByEmail, createAdmin } = require("../modules/admin/admin.repository");

const seedAdmin = async () => {
  await connectDb();

  const existingAdmin = await findAdminByEmail(env.adminEmail);
  if (existingAdmin) {
    console.log("Default admin already exists");
    process.exit(0);
  }

  const passwordHash = await hashPassword(env.adminPassword);
  await createAdmin({
    name: env.adminName,
    email: env.adminEmail,
    passwordHash,
  });

  console.log("Default admin created successfully");
  process.exit(0);
};

seedAdmin().catch((error) => {
  console.error("Failed to seed admin", error);
  process.exit(1);
});
