const express = require("express");
const { punchIn, punchOut, getMyAttendance, resetAttendance } = require("../controllers/attendanceController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/punch-in",  auth, punchIn);
router.post("/punch-out", auth, punchOut);
router.get("/my",         auth, getMyAttendance);

// HR-only: reset a specific employee's attendance for a given date
router.delete("/reset",   auth, resetAttendance);

module.exports = router;
