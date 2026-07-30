const dns = require("dns");
const app = require("./app");
const connectDb = require("./config/db");
const env = require("./config/env");
const validateProductionEnv = require("./config/validateProduction");

// EC2 often has no IPv6 route. Node undici may try AAAA first and throw "fetch failed"
// while curl recovers to IPv4. Prefer IPv4 for outbound HTTPS (AI tunnel, S3, etc.).
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const start = async () => {
  try {
    validateProductionEnv();
    await connectDb();
    app.listen(env.port, () => {
      console.log(`Server listening on port ${env.port} (${env.nodeEnv})`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

start();
