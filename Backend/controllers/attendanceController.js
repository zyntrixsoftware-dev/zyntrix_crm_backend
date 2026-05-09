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
