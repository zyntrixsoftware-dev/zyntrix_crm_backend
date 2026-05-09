const express = require("express");
const { requestShift, getMyRequests } = require("../controllers/shiftController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/request",    auth, requestShift);
router.get("/my",          auth, getMyRequests);   // canonical: /api/shifts/my

module.exports = router;
