const Attendance = require("../models/attendance");

// ── Helper: returns "YYYY-MM-DD" in UTC ──────────────────────────────────────
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

// ── GET MY ATTENDANCE ────────────────────────────────────────────────────────
exports.getMyAttendance = async (req, res) => {
  try {
    const data = await Attendance.find({ userId: req.user.id }).sort({ date: -1 });
    return res.json(data);
  } catch (err) {
    console.error("GET ATTENDANCE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── RESET ATTENDANCE FOR A DATE (HR / super_admin only) ──────────────────────
// DELETE /api/attendance/reset   body: { userId, date }
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

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ msg: "date must be in YYYY-MM-DD format" });
    }

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

// ── EDIT / CREATE ATTENDANCE (HR / super_admin only) ─────────────────────────
// POST  /api/attendance/edit  → create a new record for an absent day
// PATCH /api/attendance/edit  → update punch times for an existing record
//
// TIMEZONE NOTE:
//   The frontend sends full UTC ISO strings (e.g. "2026-05-04T04:30:00.000Z")
//   already converted from the user's local time via toUTCISO().
//   We just wrap them in new Date() — no manual offset arithmetic needed.
exports.editAttendance = async (req, res) => {
  try {
    const { role } = req.user;
    if (!["hr", "super_admin"].includes(role)) {
      return res.status(403).json({ msg: "Only HR or super_admin can edit attendance" });
    }

    const { userId, date, punchIn, punchOut, note } = req.body;

    if (!userId || !date) {
      return res.status(400).json({ msg: "userId and date are required" });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ msg: "date must be in YYYY-MM-DD format" });
    }

    const today = getUTCDate();
    if (date > today) {
      return res.status(400).json({ msg: "Cannot edit a future date" });
    }

    const existing = await Attendance.findOne({ userId, date });

    if (existing) {
      // ── UPDATE existing record ──
      // punchIn / punchOut arrive as UTC ISO strings from the frontend
      if (punchIn)              existing.punchIn  = new Date(punchIn);
      if (punchOut)             existing.punchOut = new Date(punchOut);
      if (note !== undefined)   existing.note     = note;

      await existing.save();
      return res.json({ msg: "Attendance updated", record: existing });

    } else {
      // ── CREATE new record (absent → present) ──
      if (!punchIn) {
        return res.status(400).json({ msg: "punchIn time is required to create attendance" });
      }

      const record = await Attendance.create({
        userId,
        date,
        punchIn:  new Date(punchIn),
        punchOut: punchOut ? new Date(punchOut) : null,
        note:     note || ""
      });

      return res.status(201).json({ msg: "Attendance created", record });
    }

  } catch (err) {
    console.error("EDIT ATTENDANCE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── SAVE NOTE ON ATTENDANCE RECORD (HR / super_admin only) ───────────────────
// PATCH /api/attendance/note   body: { userId, date, note }
exports.saveNote = async (req, res) => {
  try {
    const { role } = req.user;
    if (!["hr", "super_admin"].includes(role)) {
      return res.status(403).json({ msg: "Only HR or super_admin can add notes" });
    }

    const { userId, date, note } = req.body;

    if (!userId || !date) {
      return res.status(400).json({ msg: "userId and date are required" });
    }

    const record = await Attendance.findOneAndUpdate(
      { userId, date },
      { $set: { note: note || "" } },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({ msg: "No attendance record found for this date" });
    }

    return res.json({ msg: "Note saved", record });

  } catch (err) {
    console.error("SAVE NOTE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};