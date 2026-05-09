const Attendance   = require("../models/attendance");
const ShiftRequest = require("../models/ShiftRequest");
const User         = require("../models/user");

function getUTCDate() {
  return new Date().toISOString().slice(0, 10);
}

function checkHrAccess(req, res) {
  if (!["hr", "super_admin"].includes(req.user.role)) {
    res.status(403).json({ msg: "Access denied" });
    return false;
  }
  return true;
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const today = getUTCDate();

    const [employees, todayAttendance, pendingRequests] = await Promise.all([
      User.find({ role: "employee" }).select("name email role"),
      Attendance.find({ date: today }).select("userId punchIn"),
      ShiftRequest.countDocuments({ status: "pending" })
    ]);

    const presentSet = new Set(
      todayAttendance.filter(r => r.punchIn).map(r => String(r.userId))
    );

    const rows = employees.map(emp => ({
      id:     emp._id,
      name:   emp.name,
      email:  emp.email,
      role:   emp.role,
      status: presentSet.has(String(emp._id)) ? "Present" : "Absent"
    }));

    return res.json({
      stats: {
        totalEmployees:      employees.length,
        presentToday:        presentSet.size,
        absentToday:         Math.max(0, employees.length - presentSet.size),
        pendingShiftRequests: pendingRequests
      },
      employees: rows
    });

  } catch (err) {
    console.error("HR DASHBOARD ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── SHIFT REQUESTS ────────────────────────────────────────────────────────────
exports.getShiftRequests = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.userId) query.userId = req.query.userId;

    const requests = await ShiftRequest.find(query)
      .populate("userId",     "name email")
      .populate("reviewedBy", "name email")
      .sort({ date: 1, createdAt: -1 });

    return res.json(requests);
  } catch (err) {
    console.error("HR GET SHIFT REQUESTS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── UPDATE SHIFT REQUEST STATUS ───────────────────────────────────────────────
exports.updateShiftRequestStatus = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status, reviewRemarks = "" } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ msg: "status must be approved or rejected" });
    }

    const updated = await ShiftRequest.findByIdAndUpdate(
      req.params.id,
      {
        status,
        reviewRemarks: reviewRemarks.toString().slice(0, 500),
        reviewedBy:    req.user.id,
        reviewedAt:    new Date()
      },
      { returnDocument: "after" }
    ).populate("userId", "name email");

    if (!updated) return res.status(404).json({ msg: "Shift request not found" });

    return res.json(updated);
  } catch (err) {
    console.error("HR UPDATE SHIFT REQUEST ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── EMPLOYEE ATTENDANCE ───────────────────────────────────────────────────────
exports.getEmployeeAttendance = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { userId } = req.params;
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ msg: "month must be YYYY-MM" });
    }

    const [year, monthNumber] = month.split("-").map(Number);
    const start = new Date(year, monthNumber - 1, 1);
    const end   = new Date(year, monthNumber,     1);

    const [user, data] = await Promise.all([
      User.findById(userId).select("name email role"),
      Attendance.find({
        userId,
        date: {
          $gte: start.toISOString().slice(0, 10),
          $lt:  end.toISOString().slice(0, 10)
        }
      }).sort({ date: 1 })
    ]);

    if (!user) return res.status(404).json({ msg: "User not found" });

    return res.json({ user, records: data });
  } catch (err) {
    console.error("HR GET EMPLOYEE ATTENDANCE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};
