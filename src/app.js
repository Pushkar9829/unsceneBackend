const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const authRoutes = require("./modules/auth/auth.routes");
const userRoutes = require("./modules/user/user.routes");
const watchProgressRoutes = require("./modules/watchProgress/watchProgress.routes");
const adminRoutes = require("./modules/admin/admin.routes");
const analyticsRoutes = require("./modules/analytics/analytics.routes");
const seriesRoutes = require("./modules/series/series.routes");
const seriesCatalogRoutes = require("./modules/series/series.catalog.routes");
const { publicRouter: genrePublicRoutes, adminRouter: genreAdminRoutes } = require("./modules/genre/genre.routes");
const notificationRoutes = require("./modules/notification/notification.routes");
const { notFoundHandler, globalErrorHandler } = require("./common/middleware/error.middleware");

const app = express();

const corsOptions = {
  origin: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  return res.json({ success: true, message: "Backend is running" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/series", seriesCatalogRoutes);
app.use("/api/v1/genres", genrePublicRoutes);
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/user/watch-progress", watchProgressRoutes);
app.use("/api/v1/user/series", seriesRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/admin/genres", genreAdminRoutes);
app.use("/api/v1/analytics", analyticsRoutes);
// Some client code is calling `/api/notification/...` (no v1 prefix).
// Mount both to avoid 404s while the frontend is still being aligned.
app.use("/api/v1/notification", notificationRoutes);
app.use("/api/notification", notificationRoutes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;
