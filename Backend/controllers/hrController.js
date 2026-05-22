const Attendance   = require("../models/attendance");
const ShiftRequest = require("../models/ShiftRequest");
const User         = require("../models/user");
const XLSX         = require("xlsx");
const { buildPhotoUrl, apiHostFromReq } = require("./employeeController");

// Attach a small `photo` field (URL) to an employee object without dragging the
// legacy inline data URL across the wire. Works whether `e` is a Mongoose
// document or a plain object (from .lean()/aggregation).
function withPhotoUrl(e, host = "") {
  if (!e) return e;
  const obj = typeof e.toObject === "function" ? e.toObject() : { ...e };
  obj.photo    = buildPhotoUrl(obj, host);
  obj.photoUrl = obj.photo;
  return obj;
}

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
      User.find({ role: { $nin: ["super_admin"] } }).select("name email role"),
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

    const pad2      = n => String(n).padStart(2, "0");
    const startStr  = `${year}-${pad2(monthNumber)}-01`;
    const nextYear  = monthNumber === 12 ? year + 1 : year;
    const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
    const endStr    = `${nextYear}-${pad2(nextMonth)}-01`;

    const [user, data] = await Promise.all([
      User.findById(userId).select("name email role"),
      Attendance.find({
        userId,
        date: { $gte: startStr, $lt: endStr }
      }).sort({ date: 1 })
    ]);

    if (!user) return res.status(404).json({ msg: "User not found" });

    return res.json({ user, records: data });
  } catch (err) {
    console.error("HR GET EMPLOYEE ATTENDANCE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── LIST ALL EMPLOYEES ────────────────────────────────────────────────────────
exports.getEmployees = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { search, department, status, type } = req.query;
    const query = { role: { $nin: ["super_admin"] } };

    if (department) query.department = department;
    if (status)     query.employeeStatus = status;
    if (type)       query.employeeType   = type;
    if (search) {
      query.$or = [
        { name:  { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { designation: { $regex: search, $options: "i" } }
      ];
    }

    const employees = await User.find(query)
      .select("-password -otpCode -otpExpiry -otpResetToken -photo")
      .populate("reportingTo", "name designation")
      .sort({ createdAt: -1 });

    const host   = apiHostFromReq(req);
    const shaped = employees.map(e => withPhotoUrl(e, host));
    return res.json({ employees: shaped, total: shaped.length });
  } catch (err) {
    console.error("GET EMPLOYEES ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── GET SINGLE EMPLOYEE PROFILE ───────────────────────────────────────────────
exports.getEmployee = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const emp = await User.findOne({ _id: req.params.id, role: { $nin: ["super_admin"] } })
      .select("-password -otpCode -otpExpiry -otpResetToken")
      .populate("reportingTo", "name designation department");

    if (!emp) return res.status(404).json({ msg: "Employee not found" });

    const month    = new Date().toISOString().slice(0, 7);
    const [year, monthNum] = month.split("-").map(Number);
    const _pad      = n => String(n).padStart(2, "0");
    const startStr  = `${year}-${_pad(monthNum)}-01`;
    const _nextYear  = monthNum === 12 ? year + 1 : year;
    const _nextMonth = monthNum === 12 ? 1 : monthNum + 1;
    const endStr    = `${_nextYear}-${_pad(_nextMonth)}-01`;

    const attendance = await require("../models/attendance").find({
      userId: emp._id,
      date: { $gte: startStr, $lt: endStr }
    }).sort({ date: 1 });

    return res.json({ employee: withPhotoUrl(emp, apiHostFromReq(req)), attendance });
  } catch (err) {
    console.error("GET EMPLOYEE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── UPDATE EMPLOYEE PROFILE (HR edits) ───────────────────────────────────────
exports.updateEmployee = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const allowed = [
      "name","phone","department","designation","employeeType",
      "dateOfJoining","salary","reportingTo","employeeStatus",
      "address","emergencyContact","profileNote"
    ];

    const update = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });

    const emp = await User.findOneAndUpdate(
      { _id: req.params.id, role: { $nin: ["super_admin"] } },
      update,
      { new: true, runValidators: true }
    ).select("-password -otpCode -otpExpiry -otpResetToken");

    if (!emp) return res.status(404).json({ msg: "Employee not found" });
    return res.json({ msg: "Updated", employee: withPhotoUrl(emp, apiHostFromReq(req)) });
  } catch (err) {
    console.error("UPDATE EMPLOYEE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── CREATE EMPLOYEE ACCOUNT ───────────────────────────────────────────────────
exports.createEmployee = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const {
      name, email, password,
      phone, department, designation, employeeType,
      dateOfJoining, salary, reportingTo, address,
      emergencyContact, profileNote
    } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ msg: "name, email and password are required" });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ msg: "An account with this email already exists" });

    const bcrypt = require("bcryptjs");
    const hashed = await bcrypt.hash(password, 12);

    const emp = await User.create({
      name, email,
      password: hashed,
      role: "employee",
      phone, department, designation,
      employeeType: employeeType || "Full-time",
      dateOfJoining, salary,
      reportingTo: reportingTo || null,
      address, emergencyContact, profileNote,
      employeeStatus: "Active"
    });

    const safe = emp.toObject();
    delete safe.password;
    delete safe.otpCode;
    delete safe.otpExpiry;
    delete safe.otpResetToken;

    return res.status(201).json({ msg: "Employee created", employee: safe });
  } catch (err) {
    console.error("CREATE EMPLOYEE ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ── DELETE / TERMINATE EMPLOYEE ───────────────────────────────────────────────
exports.terminateEmployee = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { action } = req.body;

    if (action === "delete") {
      if (req.user.role !== "super_admin")
        return res.status(403).json({ msg: "Only super_admin can permanently delete employees" });

      await User.findOneAndDelete({ _id: req.params.id, role: { $nin: ["super_admin"] } });
      return res.json({ msg: "Employee permanently deleted" });
    }

    const emp = await User.findOneAndUpdate(
      { _id: req.params.id, role: { $nin: ["super_admin"] } },
      { employeeStatus: "Terminated" },
      { new: true }
    ).select("-password -otpCode -otpExpiry -otpResetToken");

    if (!emp) return res.status(404).json({ msg: "Employee not found" });
    return res.json({ msg: "Employee terminated", employee: emp });
  } catch (err) {
    console.error("TERMINATE EMPLOYEE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── PATCH /api/hr/employees/:id/reactivate ───────────────────────────────────
// Re-enables a deactivated account (self-deactivated from Settings, or
// deactivated by completing an offboarding case). Restores login access and
// sets the employee status back to Active.
exports.reactivateEmployee = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const emp = await User.findOneAndUpdate(
      { _id: req.params.id, role: { $nin: ["super_admin"] } },
      { active: true, employeeStatus: "Active" },
      { new: true }
    ).select("-password -otpCode -otpExpiry -otpResetToken");

    if (!emp) return res.status(404).json({ msg: "Employee not found" });
    return res.json({ msg: "Account reactivated", employee: withPhotoUrl(emp, apiHostFromReq(req)) });
  } catch (err) {
    console.error("REACTIVATE EMPLOYEE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── LIST DEPARTMENTS ──────────────────────────────────────────────────────────
exports.getDepartments = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const depts = await User.distinct("department", { role: { $nin: ["super_admin"] }, department: { $ne: "" } });
    return res.json({ departments: depts.filter(Boolean).sort() });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── HRMS DASHBOARD ────────────────────────────────────────────────────────────
exports.getHrmsDashboard = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const today = getUTCDate();

    const [
      totalEmployees,
      activeEmployees,
      todayAttendance,
      pendingRequests,
      deptBreakdown,
      recentHires
    ] = await Promise.all([
      User.countDocuments({ role: { $nin: ["super_admin"] } }),
      User.countDocuments({ role: { $nin: ["super_admin"] }, employeeStatus: "Active" }),
      require("../models/attendance").find({ date: today }).select("userId punchIn"),
      ShiftRequest.countDocuments({ status: "pending" }),
      User.aggregate([
        { $match: { role: { $nin: ["super_admin"] }, department: { $ne: "" } } },
        { $group: { _id: "$department", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      User.find({ role: { $nin: ["super_admin"] } })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name designation department employeeStatus createdAt")
    ]);

    const presentSet = new Set(
      todayAttendance.filter(r => r.punchIn).map(r => String(r.userId))
    );

    return res.json({
      stats: {
        totalEmployees,
        activeEmployees,
        presentToday:  presentSet.size,
        absentToday:   Math.max(0, activeEmployees - presentSet.size),
        pendingRequests
      },
      deptBreakdown,
      recentHires
    });
  } catch (err) {
    console.error("HRMS DASHBOARD ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── EXPORT ALL EMPLOYEES TO EXCEL ─────────────────────────────────────────────
exports.exportEmployees = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const employees = await User.find({ role: { $nin: ["super_admin"] } })
      .select("-password -otpCode -otpExpiry -otpResetToken -photo")
      .populate("reportingTo", "name")
      .sort({ name: 1 });

    const rows = employees.map(e => ({
      "Employee ID":      "EMP-" + String(e._id).slice(-5).toUpperCase(),
      "Name":             e.name || "",
      "Email":            e.email || "",
      "Role":             e.role || "",
      "Phone":            e.phone || "",
      "Department":       e.department || "",
      "Designation":      e.designation || "",
      "Employee Type":    e.employeeType || "",
      "Date of Joining":  e.dateOfJoining || "",
      "Salary":           e.salary || 0,
      "Status":           e.employeeStatus || "",
      "Reporting To":     e.reportingTo ? e.reportingTo.name : "",
      "Work Location":    e.workLocation || "",
      "Date of Birth":    e.dob || "",
      "Gender":           e.gender || "",
      "Address":          e.address || "",
      "City":             e.city || "",
      "State":            e.state || "",
      "Emergency Contact":e.emergencyContact || "",
      "Notes":            e.profileNote || ""
    }));

    const header = [
      "Employee ID","Name","Email","Role","Phone","Department","Designation",
      "Employee Type","Date of Joining","Salary","Status","Reporting To",
      "Work Location","Date of Birth","Gender","Address","City","State",
      "Emergency Contact","Notes"
    ];
    const ws = rows.length
      ? XLSX.utils.json_to_sheet(rows, { header })
      : XLSX.utils.aoa_to_sheet([header]);

    ws["!cols"] = header.map(h => ({ wch: Math.max(12, h.length + 2) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const stamp  = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="employees_${stamp}.xlsx"`);
    return res.send(buffer);
  } catch (err) {
    console.error("EXPORT EMPLOYEES ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};
