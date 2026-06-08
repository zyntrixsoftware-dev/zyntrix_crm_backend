const fs       = require("fs");
const path     = require("path");
const crypto   = require("crypto");
const bcrypt   = require("bcryptjs");
const mongoose = require("mongoose");
const User        = require("../models/user");
const Course      = require("../models/Course");
const Enrollment  = require("../models/Enrollment");
const StudentLead = require("../models/StudentLead");
const Lesson      = require("../models/LMSLesson");
const Progress    = require("../models/LMSProgress");
const Submission  = require("../models/LMSSubmission");
const CourseStaff = require("../models/LMSCourseStaff");
let sendEmail; try { sendEmail = require("../utils/sendEmail"); } catch (e) { sendEmail = async () => {}; }

const LMS_DIR = path.join(__dirname, "..", "uploads", "lms");
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const isStaff = (req) => req.user && ["lms", "instructor", "super_admin"].includes(req.user.role);
const isAdmin = (req) => req.user && ["lms", "super_admin"].includes(req.user.role);
function adminOnly(req, res) { if (!isAdmin(req)) { res.status(403).json({ msg: "LMS admin only" }); return false; } return true; }

async function enrolledStudentIds(courseId) {
  const enrs = await Enrollment.find({ course: courseId, status: { $in: ["active", "handed_off"] } }).populate("lead", "email").lean();
  const emails = [...new Set(enrs.map(e => e.lead && e.lead.email ? e.lead.email.toLowerCase() : "").filter(Boolean))];
  if (!emails.length) return [];
  const us = await User.find({ email: { $in: emails } }).select("_id").lean();
  return us.map(u => u._id);
}
function dirSizeMB(dir) {
  let total = 0;
  try { fs.readdirSync(dir).forEach(f => { try { total += fs.statSync(path.join(dir, f)).size; } catch (_) {} }); } catch (_) {}
  return Math.round(total / (1024 * 1024) * 10) / 10;
}

// ── OPS SUMMARY ──────────────────────────────────────────────────────────────
exports.opsSummary = async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    const pendingGrading = await Submission.countDocuments({ status: { $in: ["submitted", "late"] } });
    const ungraded = await Submission.find({ status: { $in: ["submitted", "late"] } })
      .sort({ submittedAt: 1 }).limit(50)
      .populate("student", "name email").populate("assignment", "title").populate("course", "title").lean();

    const courses = await Course.find({ isActive: true }).select("title").lean();
    const courseHealth = [];
    let totalLearners = 0;
    for (const c of courses) {
      const sids = await enrolledStudentIds(c._id);
      totalLearners += sids.length;
      const totalLessons = await Lesson.countDocuments({ course: c._id, isPublished: true });
      let completed = 0;
      if (totalLessons && sids.length) {
        const agg = await Progress.aggregate([
          { $match: { course: c._id, student: { $in: sids }, status: "completed" } },
          { $group: { _id: "$student", n: { $sum: 1 } } },
        ]);
        completed = agg.filter(p => p.n >= totalLessons).length;
      }
      const rate = sids.length ? Math.round(completed / sids.length * 100) : 0;
      courseHealth.push({ course: c.title, courseId: c._id, learners: sids.length, lessons: totalLessons, completed, completionRate: rate });
    }
    const lowCompletion = courseHealth.filter(c => c.learners > 0 && c.lessons > 0 && c.completionRate < 40);

    // at-risk: enrolled students with zero completed lessons anywhere
    const activeStudentIds = (await Progress.distinct("student", { status: "completed" })).map(String);
    const allEnrolled = new Set();
    const enrs = await Enrollment.find({ status: { $in: ["active", "handed_off"] } }).populate("lead", "email").lean();
    const emails = [...new Set(enrs.map(e => e.lead && e.lead.email ? e.lead.email.toLowerCase() : "").filter(Boolean))];
    const us = await User.find({ email: { $in: emails } }).select("_id name email").lean();
    const atRisk = us.filter(u => !activeStudentIds.includes(String(u._id)));

    return res.json({
      pendingGrading,
      ungraded,
      courseHealth,
      lowCompletion,
      atRiskCount: atRisk.length,
      atRisk: atRisk.slice(0, 50),
      totalLearners,
      storageMB: dirSizeMB(LMS_DIR),
    });
  } catch (e) { console.error("opsSummary:", e); return res.status(500).json({ msg: "Server error" }); }
};

// ── INSTRUCTORS ──────────────────────────────────────────────────────────────
exports.listInstructors = async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    const ins = await User.find({ role: "instructor" }).select("name email active").sort({ name: 1 }).lean();
    return res.json({ instructors: ins });
  } catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
exports.createInstructor = async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    if (!email || !email.includes("@")) return res.status(400).json({ msg: "Valid email required" });
    let u = await User.findOne({ email });
    if (u) { u.role = "instructor"; u.active = true; if (req.body.name) u.name = req.body.name; await u.save(); return res.json({ instructor: { _id: u._id, name: u.name, email: u.email }, created: false }); }
    const tempPassword = "Zi" + crypto.randomBytes(4).toString("hex") + "!" + Math.floor(10 + Math.random() * 89);
    const hash = await bcrypt.hash(tempPassword, 10);
    u = await User.create({ name: req.body.name || email.split("@")[0], email, password: hash, role: "instructor", active: true });
    let emailed = false;
    try { await sendEmail(email, "Your Zyntrix LMS Instructor Login", `Hello ${u.name},\n\nYou have been added as an instructor on Zyntrix LMS.\n\nPortal: https://zyntrixsoftware.com/crm/index.html\nEmail: ${email}\nPassword: ${tempPassword}\n\n— Zyntrix LMS`); emailed = true; } catch (e) {}
    return res.json({ instructor: { _id: u._id, name: u.name, email: u.email }, created: true, tempPassword: emailed ? null : tempPassword, emailed });
  } catch (e) { console.error("createInstructor:", e); return res.status(500).json({ msg: "Server error" }); }
};

// ── COURSE ↔ INSTRUCTOR ──────────────────────────────────────────────────────
exports.listCourseStaff = async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    const map = await CourseStaff.find({}).populate("course", "title").populate("instructor", "name email").lean();
    return res.json({ courseStaff: map });
  } catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
exports.assignInstructor = async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    const { course, instructor } = req.body;
    if (!validId(course) || !validId(instructor)) return res.status(400).json({ msg: "course and instructor required" });
    const u = await User.findById(instructor).select("name").lean();
    const m = await CourseStaff.findOneAndUpdate(
      { course },
      { $set: { instructor, instructorName: u ? u.name : "", assignedBy: req.user.id } },
      { upsert: true, new: true });
    return res.json({ courseStaff: m });
  } catch (e) { console.error("assignInstructor:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.unassignInstructor = async (req, res) => {
  if (!adminOnly(req, res)) return;
  try { await CourseStaff.findOneAndDelete({ course: req.params.course }); return res.json({ msg: "Unassigned" }); }
  catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
