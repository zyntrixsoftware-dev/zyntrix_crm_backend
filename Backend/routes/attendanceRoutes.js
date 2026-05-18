const express = require("express");
const {
  punchIn,
  punchOut,
  getMyAttendance,
  resetAttendance,
  editAttendance,   // ← new
  saveNote          // ← new
} = require("../controllers/attendanceController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/punch-in",  auth, punchIn);
router.post("/punch-out", auth, punchOut);
router.get("/my",         auth, getMyAttendance);

// HR-only
router.delete("/reset",   auth, resetAttendance);
router.post("/edit",      auth, editAttendance);   // absent → present (create)
router.patch("/edit",     auth, editAttendance);   // update existing record
router.patch("/note",     auth, saveNote);         // save/update note

module.exports = router;