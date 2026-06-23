const mongoose = require("mongoose");
const env = require("./env");

const connectDb = async () => {
  const uri = env.mongoUri;
  await mongoose.connect(uri);
  try {
    const { hostname, pathname } = new URL(uri);
    const dbName = pathname.replace(/^\//, "") || "(default)";
    console.log(`MongoDB connected (${hostname}/${dbName})`);
  } catch {
    console.log("MongoDB connected");
  }
};

module.exports = connectDb;
