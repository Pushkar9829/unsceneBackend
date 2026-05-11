const express = require("express");
const { optionalUserAuth } = require("../../common/middleware/optionalUserAuth.middleware");
const { postEvents } = require("./analytics.controller");

const router = express.Router();

router.post("/events", optionalUserAuth, postEvents);

module.exports = router;
