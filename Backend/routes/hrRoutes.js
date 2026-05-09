const express = require("express");
const { getDashboard, getShiftRequests, updateShiftRequestStatus, getEmployeeAttendance } = require("../controllers/hrController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/dashboard", auth, getDashboard);
router.get("/shift-requests", auth, getShiftRequests);
router.patch("/shift-requests/:id/status", auth, updateShiftRequestStatus);
router.get("/employee/:userId/attendance", auth, getEmployeeAttendance);

module.exports = router;
