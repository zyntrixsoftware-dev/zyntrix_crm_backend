const Attendance    = require("../models/attendance");
const PayrollRecord = require("../models/PayrollRecord");

// ── Rates from environment (configurable per deployment) ─────────────────────
const HOURLY_RATE              = parseFloat(process.env.HOURLY_RATE              || 200);
const HRA_PERCENT              = parseFloat(process.env.HRA_PERCENT              || 0.20);
const TAX_PERCENT              = parseFloat(process.env.TAX_PERCENT              || 0.10);
const OVERTIME_MULTIPLIER      = parseFloat(process.env.OVERTIME_MULTIPLIER      || 1.5);
const BONUS_THRESHOLD_HOURS    = parseFloat(process.env.OVERTIME_BONUS_THRESHOLD_HOURS || 10);
const BONUS_AMOUNT             = parseFloat(process.env.OVERTIME_BONUS_AMOUNT    || 1000);
const STANDARD_MINUTES_PER_DAY = 8 * 60;

// ── Helpers ───────────────────────────────────────────────────────────────────
function monthRange(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return {
    start: new Date(year, month - 1, 1),
    end:   new Date(year, month,     1)
  };
}

function minutesBetween(a, b) {
  return Math.max(0, Math.floor((new Date(b) - new Date(a)) / 60000));
}

function buildPayroll(records) {
  let totalWorkedMinutes = 0;
  let overtimeMinutes    = 0;

  for (const rec of records) {
    if (!rec.punchIn || !rec.punchOut) continue;
    const worked = minutesBetween(rec.punchIn, rec.punchOut);
    totalWorkedMinutes += worked;
    if (worked > STANDARD_MINUTES_PER_DAY) {
      overtimeMinutes += worked - STANDARD_MINUTES_PER_DAY;
    }
  }

  const regularMinutes  = totalWorkedMinutes - overtimeMinutes;
  const basicPay        = (regularMinutes / 60) * HOURLY_RATE;
  const overtimePay     = (overtimeMinutes / 60) * HOURLY_RATE * OVERTIME_MULTIPLIER;
  const hra             = basicPay * HRA_PERCENT;
  const overtimeHours   = overtimeMinutes / 60;
  const bonus           = overtimeHours > BONUS_THRESHOLD_HOURS ? BONUS_AMOUNT : 0;
  const grossPay        = basicPay + hra + bonus + overtimePay;
  const tax             = grossPay * TAX_PERCENT;
  const penalties       = 0;
  const deductions      = tax + penalties;
  const netPay          = Math.max(0, grossPay - deductions);

  return {
    totalWorkedMinutes,
    overtimeMinutes,
    basicPay,
    hra,
    bonus,
    overtimePay,
    grossPay,
    tax,
    penalties,
    deductions,
    netPay
  };
}

// ── FIX: only recalculate if the record is still "pending" ───────────────────
async function computeAndSave(userId, month) {
  const { start, end } = monthRange(month);

  // Check if a locked (paid/failed) record already exists
  const existing = await PayrollRecord.findOne({ userId, month });
  if (existing && existing.paymentStatus !== "pending") {
    // Return locked record with attendance for display purposes only
    const attendance = await Attendance.find({
      userId,
      date: {
        $gte: start.toISOString().slice(0, 10),
        $lt:  end.toISOString().slice(0, 10)
      }
    }).sort({ date: 1 });
    return { payroll: existing, attendance };
  }

  const attendance = await Attendance.find({
    userId,
    date: {
      $gte: start.toISOString().slice(0, 10),
      $lt:  end.toISOString().slice(0, 10)
    }
  }).sort({ date: 1 });

  const computed = buildPayroll(attendance);

  const payroll = await PayrollRecord.findOneAndUpdate(
    { userId, month },
    {
      $set:         { ...computed },
      $setOnInsert: { paymentStatus: "pending" }
    },
    { upsert: true, returnDocument: "after" }
  );

  return { payroll, attendance };
}

// ── ROUTES ────────────────────────────────────────────────────────────────────

exports.getMyPayroll = async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    // Validate format
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ msg: "month must be YYYY-MM" });
    }

    const { payroll, attendance } = await computeAndSave(req.user.id, month);
    return res.json({ payroll, attendance });
  } catch (err) {
    console.error("GET MY PAYROLL ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.getMyPayrollHistory = async (req, res) => {
  try {
    const history = await PayrollRecord.find({ userId: req.user.id }).sort({ month: -1 });
    return res.json(history);
  } catch (err) {
    console.error("GET PAYROLL HISTORY ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.getPayrollRecords = async (req, res) => {
  try {
    if (!["hr", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ msg: "Access denied" });
    }

    const query = {};
    if (req.query.userId) query.userId = req.query.userId;
    if (req.query.month)  query.month  = req.query.month;

    const records = await PayrollRecord.find(query)
      .populate("userId", "name email role")
      .sort({ month: -1, createdAt: -1 });

    return res.json(records);
  } catch (err) {
    console.error("GET PAYROLL RECORDS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

exports.updatePayrollStatus = async (req, res) => {
  try {
    if (!["hr", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ msg: "Access denied" });
    }

    const { status } = req.body;
    if (!["paid", "pending", "failed"].includes(status)) {
      return res.status(400).json({ msg: "status must be paid, pending, or failed" });
    }

    const updated = await PayrollRecord.findByIdAndUpdate(
      req.params.id,
      { paymentStatus: status },
      { returnDocument: "after" }
    );

    if (!updated) return res.status(404).json({ msg: "Payroll record not found" });

    return res.json(updated);
  } catch (err) {
    console.error("UPDATE PAYROLL STATUS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};
