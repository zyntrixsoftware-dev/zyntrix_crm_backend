/**
 * Sales Import Controller
 * Imports Excel / CSV data directly into native MongoDB models.
 * Supports cross-reference resolution: custom IDs (USR001, LD001 …) → ObjectIds.
 *
 * Routes:
 *   POST /api/sales/import/preview   – parse file, return headers + 3 sample rows
 *   POST /api/sales/import/:type     – import into native model
 *   GET  /api/sales/import/template/:type – return JSON schema for template download
 */

const multer  = require("multer");
const XLSX    = require("xlsx");
const mongoose = require("mongoose");

// ── Models ────────────────────────────────────────────────────────────────────
const StudentLead  = require("../models/StudentLead");
const Course       = require("../models/Course");
const Batch        = require("../models/Batch");
const Enrollment   = require("../models/Enrollment");
const Payment      = require("../models/Payment");
const DemoSession  = require("../models/DemoSession");
const FollowUp     = require("../models/FollowUp");
const SalesTarget  = require("../models/SalesTarget");
const Coupon       = require("../models/Coupon");
const CommLog      = require("../models/CommLog");
const Referral     = require("../models/Referral");
const User         = require("../models/user");

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.memoryStorage();
exports.upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only .xlsx / .xls / .csv files allowed"), ok);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseFile(buffer) {
  const wb   = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function toBool(v) {
  if (typeof v === "boolean") return v;
  return String(v).toLowerCase() === "yes" || String(v).toLowerCase() === "true";
}

function toNum(v) {
  const n = parseFloat(String(v).replace(/[₹,]/g, "").trim());
  return isNaN(n) ? 0 : n;
}

function clean(v) {
  return v !== null && v !== undefined ? String(v).trim() : "";
}

// Build lookup: customId → ObjectId for each model
async function buildLookup(Model, customIdField, importIdField = null) {
  const docs = await Model.find({}, `_id ${customIdField} ${importIdField || ""}`.trim()).lean();
  const map  = {};
  docs.forEach(d => {
    if (d[customIdField]) map[d[customIdField]] = d._id;
    if (importIdField && d[importIdField]) map[d[importIdField]] = d._id;
  });
  return map;
}

// ── PREVIEW ───────────────────────────────────────────────────────────────────
exports.previewImport = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: "No file uploaded" });
    const rows = parseFile(req.file.buffer);
    if (!rows.length) return res.status(400).json({ msg: "File has no data rows" });
    const headers = Object.keys(rows[0]);
    const sample  = rows.slice(0, 3);
    return res.json({ headers, sample, totalRows: rows.length });
  } catch (err) {
    return res.status(500).json({ msg: "Preview failed: " + err.message });
  }
};

// ── TEMPLATE SCHEMA ───────────────────────────────────────────────────────────
const TEMPLATES = {
  leads: {
    label: "Student Leads",
    columns: ["Full Name","Phone","Email","City","Budget (₹)","Pipeline Stage","Source","Follow Up Date","Notes"],
    enums: {
      "Pipeline Stage": ["new_lead","contacted","demo_scheduled","demo_attended","enrolled","dropped"],
      "Source": ["website","social_media","referral","cold_call","walk_in","other"]
    }
  },
  courses: {
    label: "Courses",
    columns: ["Title","Category","Price (₹)","Discount Price (₹)","Mode","Duration (Weeks)","Is Active"],
    enums: {
      "Category": ["tech","design","business","marketing","language","other"],
      "Mode": ["online","offline","hybrid"],
      "Is Active": ["Yes","No"]
    }
  },
  batches: {
    label: "Batches",
    columns: ["Course Title","Batch Code","Start Date","End Date","Total Seats","Mode","Status","Notes"],
    enums: {
      "Mode": ["online","offline","hybrid"],
      "Status": ["upcoming","ongoing","completed","cancelled"]
    }
  },
  demos: {
    label: "Demo Sessions",
    columns: ["Lead Phone","Scheduled At","Outcome","Notes"],
    enums: {
      "Outcome": ["interested","not_interested","follow_up","no_show","enrolled"]
    }
  },
  followups: {
    label: "Follow-Ups",
    columns: ["Lead Phone","Due At","Type","Notes","Is Completed"],
    enums: {
      "Type": ["call","whatsapp","email","meeting"],
      "Is Completed": ["Yes","No"]
    }
  },
  targets: {
    label: "Sales Targets",
    columns: ["Rep Email","Month","Year","Target Leads","Target Demos","Target Enrollments","Target Revenue (₹)"],
    enums: {
      "Month": ["1","2","3","4","5","6","7","8","9","10","11","12"]
    }
  },
  coupons: {
    label: "Coupons",
    columns: ["Code","Coupon Type","Discount Type","Discount Value","Min Order Value (₹)","Max Uses","Valid Till","Is Active"],
    enums: {
      "Coupon Type": ["promo","scholarship","referral","staff"],
      "Discount Type": ["flat","percent"],
      "Is Active": ["Yes","No"]
    }
  },
  commlogs: {
    label: "Communication Logs",
    columns: ["Lead Phone","Type","Direction","Summary","Duration (seconds)","Logged At"],
    enums: {
      "Type": ["call","whatsapp","email","sms","meeting","other"],
      "Direction": ["outbound","inbound"]
    }
  },
  referrals: {
    label: "Referrals",
    columns: ["Referred By Phone","Referred By Name","Referred Lead Phone","Incentive Type","Incentive Value (₹)","Status"],
    enums: {
      "Incentive Type": ["cash","discount","gift","none"],
      "Status": ["pending","enrolled","paid","rejected"]
    }
  }
};

exports.getTemplate = (req, res) => {
  const type = req.params.type;
  if (!TEMPLATES[type]) return res.status(404).json({ msg: "Unknown type" });
  return res.json(TEMPLATES[type]);
};

exports.listTypes = (req, res) => {
  const list = Object.entries(TEMPLATES).map(([key, v]) => ({ key, label: v.label, columns: v.columns.length }));
  return res.json(list);
};

// ── MAIN IMPORT ───────────────────────────────────────────────────────────────
exports.importData = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: "No file uploaded" });
    const type = req.params.type;
    const rows = parseFile(req.file.buffer);
    if (!rows.length) return res.status(400).json({ msg: "File has no data rows" });

    const userId = req.user._id;
    let result;

    switch (type) {
      case "leads":       result = await importLeads(rows, userId);       break;
      case "courses":     result = await importCourses(rows, userId);     break;
      case "batches":     result = await importBatches(rows, userId);     break;
      case "demos":       result = await importDemos(rows, userId);       break;
      case "followups":   result = await importFollowUps(rows, userId);   break;
      case "targets":     result = await importTargets(rows, userId);     break;
      case "coupons":     result = await importCoupons(rows, userId);     break;
      case "commlogs":    result = await importCommLogs(rows, userId);    break;
      case "referrals":   result = await importReferrals(rows, userId);   break;
      default: return res.status(400).json({ msg: `Unknown type: ${type}` });
    }

    return res.json(result);
  } catch (err) {
    console.error("salesImport error:", err);
    return res.status(500).json({ msg: "Import failed: " + err.message });
  }
};

// ── IMPORTERS ─────────────────────────────────────────────────────────────────

// Helper: find lead by phone or email
async function findLead(phoneOrEmail) {
  if (!phoneOrEmail) return null;
  const v = clean(phoneOrEmail);
  return StudentLead.findOne({ $or: [{ phone: v }, { email: v }] }).lean();
}

// Helper: find user by email or name
async function findUser(emailOrName) {
  if (!emailOrName) return null;
  const v = clean(emailOrName);
  return User.findOne({ $or: [{ email: v }, { name: { $regex: v, $options: "i" } }] }).lean();
}

// ── 1. LEADS ──────────────────────────────────────────────────────────────────
async function importLeads(rows, userId) {
  const STAGE_MAP = {
    "new lead": "new_lead", "new_lead": "new_lead",
    "contacted": "contacted",
    "demo scheduled": "demo_scheduled", "demo_scheduled": "demo_scheduled",
    "demo attended": "demo_attended", "demo_attended": "demo_attended",
    "enrolled": "enrolled", "dropped": "dropped", "completed": "completed"
  };
  const SOURCE_MAP = {
    "google ads": "website", "website": "website",
    "social media": "social_media", "social_media": "social_media",
    "referral": "referral", "cold call": "cold_call", "cold_call": "cold_call",
    "walk in": "walk_in", "walk_in": "walk_in", "other": "other"
  };

  let inserted = 0, skipped = 0, errors = [];
  for (const row of rows) {
    try {
      const name  = clean(row["Full Name"] || row["fullName"] || row["Name"] || "");
      const phone = clean(row["Phone"] || row["phone"] || "");
      if (!name) { skipped++; continue; }

      const stageRaw = clean(row["Pipeline Stage"] || row["pipelineStage"] || "new_lead").toLowerCase();
      const srcRaw   = clean(row["Source"] || row["source"] || "other").toLowerCase();

      const doc = {
        fullName:      name,
        phone,
        email:         clean(row["Email"] || row["email"] || ""),
        city:          clean(row["City"] || row["city"] || ""),
        budget:        toNum(row["Budget (₹)"] || row["budget"] || 0),
        pipelineStage: STAGE_MAP[stageRaw] || "new_lead",
        source:        SOURCE_MAP[srcRaw] || "other",
        followUpDate:  toDate(row["Follow Up Date"] || row["followUpDate"] || null),
        notes:         clean(row["Notes"] || row["notes"] || ""),
        score:         toNum(row["Score"] || row["score"] || 0),
        createdBy:     userId
      };

      // Upsert by phone (avoid duplicates on re-import)
      if (phone) {
        await StudentLead.findOneAndUpdate({ phone }, { $set: doc }, { upsert: true });
      } else {
        await StudentLead.create(doc);
      }
      inserted++;
    } catch (e) {
      errors.push({ row: row["Full Name"] || "?", err: e.message });
    }
  }
  return { inserted, skipped, errors: errors.slice(0, 10), total: rows.length };
}

// ── 2. COURSES ────────────────────────────────────────────────────────────────
async function importCourses(rows, userId) {
  const CAT_MAP = { "competitive exam": "tech", "tech": "tech", "design": "design",
    "business": "business", "marketing": "marketing", "language": "language", "other": "other" };
  const MODE_MAP = { "online": "online", "offline": "offline", "hybrid": "hybrid" };

  let inserted = 0, skipped = 0, errors = [];
  for (const row of rows) {
    try {
      const title = clean(row["Title"] || row["title"] || "");
      if (!title) { skipped++; continue; }

      const catRaw  = clean(row["Category"] || row["category"] || "other").toLowerCase();
      const modeRaw = clean(row["Mode"] || row["mode"] || "online").toLowerCase();

      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      const doc = {
        title,
        description:   clean(row["Description"] || row["description"] || ""),
        category:      CAT_MAP[catRaw] || "other",
        price:         toNum(row["Price (₹)"] || row["price"] || 0),
        discountPrice: toNum(row["Discount Price (₹)"] || row["discountPrice"] || 0),
        mode:          MODE_MAP[modeRaw] || "online",
        durationWeeks: toNum(row["Duration (Weeks)"] || row["durationWeeks"] || 8),
        isActive:      toBool(row["Is Active"] !== undefined ? row["Is Active"] : true),
        createdBy:     userId
      };

      await Course.findOneAndUpdate({ title }, { $set: { ...doc, slug } }, { upsert: true });
      inserted++;
    } catch (e) {
      errors.push({ row: row["Title"] || "?", err: e.message });
    }
  }
  return { inserted, skipped, errors: errors.slice(0, 10), total: rows.length };
}

// ── 3. BATCHES ────────────────────────────────────────────────────────────────
async function importBatches(rows, userId) {
  const STATUS_MAP = { "active": "ongoing", "ongoing": "ongoing", "upcoming": "upcoming",
    "completed": "completed", "cancelled": "cancelled" };
  const MODE_MAP = { "online": "online", "offline": "offline", "hybrid": "hybrid" };

  // Build course lookup by title
  const courses = await Course.find({}, "_id title").lean();
  const courseByTitle = {};
  courses.forEach(c => { courseByTitle[c.title.toLowerCase()] = c._id; });

  let inserted = 0, skipped = 0, errors = [];
  for (const row of rows) {
    try {
      const batchCode = clean(row["Batch Code"] || row["batchCode"] || "").toUpperCase();
      if (!batchCode) { skipped++; continue; }

      // Resolve course
      const courseTitle = clean(row["Course Title"] || row["courseTitle"] || "").toLowerCase();
      const courseId    = courseByTitle[courseTitle] || null;

      const statusRaw = clean(row["Status"] || row["status"] || "upcoming").toLowerCase();
      const modeRaw   = clean(row["Mode"]   || row["mode"]   || "online").toLowerCase();

      const doc = {
        course:      courseId,
        batchCode,
        startDate:   toDate(row["Start Date"] || row["startDate"] || null),
        endDate:     toDate(row["End Date"]   || row["endDate"]   || null),
        totalSeats:  toNum(row["Total Seats"] || row["totalSeats"] || 30),
        seatsBooked: toNum(row["Seats Booked"] || row["seatsBooked"] || 0),
        mode:        MODE_MAP[modeRaw] || "online",
        status:      STATUS_MAP[statusRaw] || "upcoming",
        notes:       clean(row["Notes"] || row["notes"] || ""),
        createdBy:   userId
      };

      await Batch.findOneAndUpdate({ batchCode }, { $set: doc }, { upsert: true });
      inserted++;
    } catch (e) {
      errors.push({ row: row["Batch Code"] || "?", err: e.message });
    }
  }
  return { inserted, skipped, errors: errors.slice(0, 10), total: rows.length };
}

// ── 4. DEMO SESSIONS ─────────────────────────────────────────────────────────
async function importDemos(rows, userId) {
  let inserted = 0, skipped = 0, errors = [];
  for (const row of rows) {
    try {
      const leadRef = clean(row["Lead Phone"] || row["phone"] || row["leadPhone"] || "");
      const lead    = await findLead(leadRef);
      if (!lead) { skipped++; continue; }

      const doc = {
        lead:        lead._id,
        scheduledAt: toDate(row["Scheduled At"] || row["scheduledAt"] || new Date()),
        conductor:   userId,
        outcome:     clean(row["Outcome"] || row["outcome"] || "interested").toLowerCase().replace(/ /g,"_"),
        notes:       clean(row["Notes"] || row["notes"] || ""),
        createdBy:   userId
      };
      await DemoSession.create(doc);
      inserted++;
    } catch (e) {
      errors.push({ row: row["Lead Phone"] || "?", err: e.message });
    }
  }
  return { inserted, skipped, errors: errors.slice(0, 10), total: rows.length };
}

// ── 5. FOLLOW-UPS ─────────────────────────────────────────────────────────────
async function importFollowUps(rows, userId) {
  let inserted = 0, skipped = 0, errors = [];
  for (const row of rows) {
    try {
      const leadRef = clean(row["Lead Phone"] || row["phone"] || "");
      const lead    = await findLead(leadRef);
      if (!lead) { skipped++; continue; }

      const doc = {
        lead:        lead._id,
        assignedTo:  userId,
        dueAt:       toDate(row["Due At"] || row["dueAt"] || null),
        type:        clean(row["Type"] || row["type"] || "call").toLowerCase(),
        notes:       clean(row["Notes"] || row["notes"] || ""),
        isCompleted: toBool(row["Is Completed"] || false),
        createdBy:   userId
      };
      await FollowUp.create(doc);
      inserted++;
    } catch (e) {
      errors.push({ row: row["Lead Phone"] || "?", err: e.message });
    }
  }
  return { inserted, skipped, errors: errors.slice(0, 10), total: rows.length };
}

// ── 6. SALES TARGETS ─────────────────────────────────────────────────────────
const MONTH_MAP = {
  "january":1,"jan":1,"february":2,"feb":2,"march":3,"mar":3,"april":4,"apr":4,
  "may":5,"june":6,"jun":6,"july":7,"jul":7,"august":8,"aug":8,
  "september":9,"sep":9,"october":10,"oct":10,"november":11,"nov":11,"december":12,"dec":12
};

async function importTargets(rows, userId) {
  let inserted = 0, skipped = 0, errors = [];
  for (const row of rows) {
    try {
      const repRef = clean(row["Rep Email"] || row["email"] || "");
      let repId = userId;
      if (repRef) {
        const u = await findUser(repRef);
        if (u) repId = u._id;
      }

      const monthRaw = clean(row["Month"] || "").toLowerCase();
      const month    = MONTH_MAP[monthRaw] || parseInt(monthRaw) || new Date().getMonth() + 1;
      const year     = parseInt(clean(row["Year"] || "")) || new Date().getFullYear();

      const doc = {
        user:                repId,
        month, year,
        targetLeads:         toNum(row["Target Leads"] || 0),
        targetDemos:         toNum(row["Target Demos"] || 0),
        targetEnrollments:   toNum(row["Target Enrollments"] || 0),
        targetRevenue:       toNum(row["Target Revenue (₹)"] || row["targetRevenue"] || 0),
        achievedLeads:       toNum(row["Achieved Leads"] || 0),
        achievedDemos:       toNum(row["Achieved Demos"] || 0),
        achievedEnrollments: toNum(row["Achieved Enrollments"] || 0),
        achievedRevenue:     toNum(row["Achieved Revenue (₹)"] || 0),
        createdBy:           userId
      };

      await SalesTarget.findOneAndUpdate({ user: repId, month, year }, { $set: doc }, { upsert: true });
      inserted++;
    } catch (e) {
      errors.push({ row: row["Rep Email"] || "?", err: e.message });
    }
  }
  return { inserted, skipped, errors: errors.slice(0, 10), total: rows.length };
}

// ── 7. COUPONS ────────────────────────────────────────────────────────────────
async function importCoupons(rows, userId) {
  let inserted = 0, skipped = 0, errors = [];
  for (const row of rows) {
    try {
      const code = clean(row["Code"] || row["code"] || "").toUpperCase();
      if (!code) { skipped++; continue; }

      const dtRaw = clean(row["Discount Type"] || row["discountType"] || "flat").toLowerCase();
      const dtype = dtRaw === "%" || dtRaw === "percent" ? "percent" : "flat";

      const doc = {
        code,
        description:   clean(row["Description"] || ""),
        couponType:    clean(row["Coupon Type"] || row["couponType"] || "promo").toLowerCase(),
        discountType:  dtype,
        discountValue: toNum(row["Discount Value"] || row["Value"] || 0),
        minOrderValue: toNum(row["Min Order Value (₹)"] || row["minOrderValue"] || 0),
        maxUses:       row["Max Uses"] ? toNum(row["Max Uses"]) : null,
        validTill:     toDate(row["Valid Till"] || row["validTill"] || null),
        isActive:      toBool(row["Is Active"] !== undefined ? row["Is Active"] : true),
        createdBy:     userId
      };

      await Coupon.findOneAndUpdate({ code }, { $set: doc }, { upsert: true });
      inserted++;
    } catch (e) {
      errors.push({ row: row["Code"] || "?", err: e.message });
    }
  }
  return { inserted, skipped, errors: errors.slice(0, 10), total: rows.length };
}

// ── 8. COMMUNICATION LOGS ─────────────────────────────────────────────────────
async function importCommLogs(rows, userId) {
  let inserted = 0, skipped = 0, errors = [];
  for (const row of rows) {
    try {
      const leadRef = clean(row["Lead Phone"] || row["phone"] || "");
      const lead    = await findLead(leadRef);
      if (!lead) { skipped++; continue; }

      const doc = {
        lead:      lead._id,
        type:      clean(row["Type"] || "call").toLowerCase(),
        direction: clean(row["Direction"] || "outbound").toLowerCase(),
        summary:   clean(row["Summary"] || row["summary"] || ""),
        duration:  toNum(row["Duration (seconds)"] || row["Duration (min)"] ? toNum(row["Duration (min)"]) * 60 : 0),
        loggedAt:  toDate(row["Logged At"] || row["loggedAt"] || row["Created At"] || new Date()),
        createdBy: userId
      };
      await CommLog.create(doc);
      inserted++;
    } catch (e) {
      errors.push({ row: row["Lead Phone"] || "?", err: e.message });
    }
  }
  return { inserted, skipped, errors: errors.slice(0, 10), total: rows.length };
}

// ── 9. REFERRALS ──────────────────────────────────────────────────────────────
async function importReferrals(rows, userId) {
  let inserted = 0, skipped = 0, errors = [];
  for (const row of rows) {
    try {
      const byPhone   = clean(row["Referred By Phone"] || row["referredByPhone"] || "");
      const leadPhone = clean(row["Referred Lead Phone"] || row["referredLeadPhone"] || "");

      const byLead   = await findLead(byPhone);
      const newLead  = await findLead(leadPhone);
      if (!newLead) { skipped++; continue; }

      const doc = {
        referredBy:     byLead?._id || null,
        referredByName: clean(row["Referred By Name"] || row["referredByName"] || ""),
        referredLead:   newLead._id,
        incentiveType:  clean(row["Incentive Type"] || "cash").toLowerCase(),
        incentiveValue: toNum(row["Incentive Value (₹)"] || row["incentiveValue"] || 0),
        status:         clean(row["Status"] || "pending").toLowerCase(),
        createdBy:      userId
      };
      await Referral.create(doc);
      inserted++;
    } catch (e) {
      errors.push({ row: row["Referred Lead Phone"] || "?", err: e.message });
    }
  }
  return { inserted, skipped, errors: errors.slice(0, 10), total: rows.length };
}
