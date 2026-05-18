const express = require("express");
const {
  punchIn,
  punchOut,
  getMyAttendance,
  resetAttendance,
  editAttendance,   // HR: create (POST) or update (PATCH) a record
  saveNote          // HR: save/update a note on a record
} = require("../controllers/attendanceController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// Employee self-service
router.post("/punch-in",  auth, punchIn);
router.post("/punch-out", auth, punchOut);
router.get("/my",         auth, getMyAttendance);

// HR / super_admin only
router.delete("/reset",   auth, resetAttendance);  // delete a record so employee can re-punch
router.post("/edit",      auth, editAttendance);   // absent → present (create new record)
router.patch("/edit",     auth, editAttendance);   // update punch times on existing record
router.patch("/note",     auth, saveNote);         // add/update note on a record

module.exports = router;