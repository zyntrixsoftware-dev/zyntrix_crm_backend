const Attendance = require("../models/attendance");

// ── Helper: returns "YYYY-MM-DD" in UTC (consistent across server & client) ──
function getUTCDate() {
  return new Date().toISOString().slice(0, 10);
}

// ── PUNCH IN ─────────────────────────────────────────────────────────────────
exports.punchIn = async (req, res) => {
  try {
    const today = getUTCDate();

    const existing = await Attendance.findOne({ userId: req.user.id, date: today });
    if (existing) {
      return res.status(400).json({ msg: "Already punched in for today" });
    }

    // FIX: unique index on {userId, date} handles race conditions at DB level
    const record = await Attendance.create({
      userId:  req.user.id,
      date:    today,
      punchIn: new Date()
    });

    return res.json(record);

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ msg: "Already punched in for today" });
    }
    console.error("PUNCH IN ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── PUNCH OUT ────────────────────────────────────────────────────────────────
exports.punchOut = async (req, res) => {
  try {
    const today = getUTCDate();

    const record = await Attendance.findOne({ userId: req.user.id, date: today });

    if (!record) {
      return res.status(400).json({ msg: "You have not punched in today" });
    }
    if (record.punchOut) {
      return res.status(400).json({ msg: "Already punched out for today" });
    }

    record.punchOut = new Date();
    await record.save();

    return res.json(record);

  } catch (err) {
    console.error("PUNCH OUT ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── GET MY ATTENDANCE ─────────────────────────────────────────────────────────
exports.getMyAttendance = async (req, res) => {
  try {
    const data = await Attendance.find({ userId: req.user.id }).sort({ date: -1 });
    return res.json(data);
  } catch (err) {
    console.error("GET ATTENDANCE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── RESET ATTENDANCE FOR A DATE (HR / super_admin only) ───────────────────────
// DELETE /api/attendance/reset  body: { userId, date }
// Deletes the attendance record so the employee can punch in fresh on that date.
exports.resetAttendance = async (req, res) => {
  try {
    const { role } = req.user;
    if (!["hr", "super_admin"].includes(role)) {
      return res.status(403).json({ msg: "Only HR or super_admin can reset attendance" });
    }

    const { userId, date } = req.body;

    if (!userId || !date) {
      return res.status(400).json({ msg: "userId and date are required" });
    }

    // validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ msg: "date must be in YYYY-MM-DD format" });
    }

    // don't allow resetting future dates (no record would exist anyway, but be explicit)
    const today = getUTCDate();
    if (date > today) {
      return res.status(400).json({ msg: "Cannot reset a future date" });
    }

    const result = await Attendance.findOneAndDelete({ userId, date });

    if (!result) {
      return res.status(404).json({ msg: "No attendance record found for this employee on that date" });
    }

    return res.json({
      msg: `Attendance for ${date} has been reset. The employee can now punch in again.`,
      deleted: result
    });

  } catch (err) {
    console.error("RESET ATTENDANCE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};
