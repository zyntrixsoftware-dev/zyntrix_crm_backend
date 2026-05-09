const express = require("express");
const { punchIn, punchOut, getMyAttendance } = require("../controllers/attendanceController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/punch-in",  auth, punchIn);
router.post("/punch-out", auth, punchOut);
router.get("/my",         auth, getMyAttendance);   // canonical: /api/attendance/my

module.exports = router;
