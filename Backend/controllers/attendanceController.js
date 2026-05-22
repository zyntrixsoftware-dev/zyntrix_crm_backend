const Attendance = require("../models/attendance");

// ─────────────────────────────────────────────────────────────────────────────
// TIME ZONE HELPERS
// All employees are in India, so the punch windows are interpreted in IST
// (UTC+5:30). The server itself (Render) runs on UTC, so we explicitly shift
// the current time into IST before comparing windows — this way the windows
// behave correctly regardless of the server's configured timezone.
// ─────────────────────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Returns the current wall-clock minutes-since-midnight in IST.
function nowMinutesIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

// Returns "YYYY-MM-DD" in IST. Two punches on the same IST day must share a
// date key, even if UTC has already rolled to the next day (e.g. 5:30 AM UTC
// is 11:00 AM IST — still the same Indian working day).
function todayDateIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return ist.toISOString().slice(0, 10);
}

// Window definitions (minutes since midnight IST)
const PUNCH_IN_START  =  9 * 60 + 50;   // 09:50
const PUNCH_IN_END    = 10 * 60 +  5;   // 10:05
const PUNCH_OUT_START = 17 * 60;        // 17:00
const PUNCH_OUT_END   = 18 * 60;        // 18:00 (employees can stay until 6 PM)
const PUNCH_OUT_CAP   = 17 * 60;        // recorded punch-out is always exactly 17:00

function formatHM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

// ── PUNCH IN ─────────────────────────────────────────────────────────────────
// • Allowed only between 09:50 and 10:05 IST.
// • Idempotent — if the employee taps multiple times inside the window, the
//   *existing* record is returned with HTTP 200 (not an error). The DB's
//   unique index on { userId, date } also makes this race-safe.
exports.punchIn = async (req, res) => {
  try {
    const minsNow = nowMinutesIST();
    const today   = todayDateIST();

    const existing = await Attendance.findOne({ userId: req.user.id, date: today });

    // Idempotent: if they already punched in today, just return that record.
    if (existing) {
      return res.json({ ...existing.toObject(), msg: "Already punched in for today" });
    }

    if (minsNow < PUNCH_IN_START || minsNow > PUNCH_IN_END) {
      return res.status(400).json({
        msg: `Punch-in is only allowed between ${formatHM(PUNCH_IN_START)} and ${formatHM(PUNCH_IN_END)} IST.`
      });
    }

    const record = await Attendance.create({
      userId:  req.user.id,
      date:    today,
      punchIn: new Date()
    });

    return res.json(record);

  } catch (err) {
    // Duplicate key (race): two concurrent requests in the window → second
    // one falls here; return the existing record so the client treats it as
    // a successful punch.
    if (err.code === 11000) {
      const existing = await Attendance.findOne({ userId: req.user.id, date: todayDateIST() });
      if (existing) return res.json({ ...existing.toObject(), msg: "Already punched in for today" });
    }
    console.error("PUNCH IN ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── PUNCH OUT ────────────────────────────────────────────────────────────────
// • Allowed only between 17:00 and 17:10 IST.
// • Requires an existing punch-in record for today.
exports.punchOut = async (req, res) => {
  try {
    const minsNow = nowMinutesIST();
    const today   = todayDateIST();

    if (minsNow < PUNCH_OUT_START || minsNow > PUNCH_OUT_END) {
      return res.status(400).json({
        msg: `Punch-out is only allowed between ${formatHM(PUNCH_OUT_START)} and ${formatHM(PUNCH_OUT_END)} IST.`
      });
    }

    const record = await Attendance.findOne({ userId: req.user.id, date: today });

    if (!record) {
      return res.status(400).json({ msg: "You have not punched in today" });
    }
    if (record.punchOut) {
      return res.status(400).json({ msg: "Already punched out for today" });
    }

    // Stored punch-out is *always* the official end of shift (5:00 PM IST),
    // never the wall-clock time the employee actually clicked. This eliminates
    // overtime — working hours are capped at the standard shift length even
    // when an employee chooses to stay until 6 PM.
    const now = new Date();
    const istNow = new Date(now.getTime() + IST_OFFSET_MS);
    const cap = new Date(Date.UTC(
      istNow.getUTCFullYear(),
      istNow.getUTCMonth(),
      istNow.getUTCDate(),
      17, 0, 0   // 17:00 IST
    ) - IST_OFFSET_MS);   // shift back to UTC for storage
    record.punchOut = cap;
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
    if (date > todayDateIST()) {
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
//
// 0:00 / MIDNIGHT NOTE:
//   The frontend may send punchIn/punchOut as the literal string "" or "null"
//   to mean "clear this punch". Treat any of those as a clear (set field to
//   null) rather than midnight. Real punches always carry a non-empty value.
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
    if (date > todayDateIST()) {
      return res.status(400).json({ msg: "Cannot edit a future date" });
    }

    // Normalise the incoming punch times. Empty string / null / explicit
    // "__CLEAR__" sentinel all mean "remove this time". Anything else is
    // parsed as an ISO date.
    function normaliseTime(v) {
      if (v === undefined) return undefined;          // field not sent → leave untouched
      if (v === null || v === "" || v === "__CLEAR__") return null;
      return new Date(v);
    }

    const inVal  = normaliseTime(punchIn);
    const outVal = normaliseTime(punchOut);

    const existing = await Attendance.findOne({ userId, date });

    if (existing) {
      if (inVal  !== undefined) existing.punchIn  = inVal;
      if (outVal !== undefined) existing.punchOut = outVal;
      if (note   !== undefined) existing.note     = note;

      // If both punches are cleared, the record is meaningless — delete it
      // so the day shows as absent again.
      if (!existing.punchIn && !existing.punchOut && !existing.note) {
        await existing.deleteOne();
        return res.json({ msg: "Attendance cleared for this date", record: null });
      }

      await existing.save();
      return res.json({ msg: "Attendance updated", record: existing });

    } else {
      // CREATE — need at least a punch-in to mark the day present.
      if (!inVal) {
        return res.status(400).json({ msg: "punchIn time is required to create attendance" });
      }

      const record = await Attendance.create({
        userId,
        date,
        punchIn:  inVal,
        punchOut: outVal || null,
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
