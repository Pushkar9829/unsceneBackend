const express = require("express");
const { listCatalog } = require("./series.catalog.controller");

const router = express.Router();

router.get("/", listCatalog);

module.exports = router;
