const fs       = require("fs");
const path     = require("path");
const crypto   = require("crypto");
const multer   = require("multer");
const bcrypt   = require("bcryptjs");
const mongoose = require("mongoose");

const User        = require("../models/user");
const Course      = require("../models/Course");
const Enrollment  = require("../models/Enrollment");
const StudentLead = require("../models/StudentLead");
const Assignment  = require("../models/LMSAssignment");
const Submission  = require("../models/LMSSubmission");
const Quiz        = require("../models/LMSQuiz");
const Attempt     = require("../models/LMSQuizAttempt");
const Announce    = require("../models/LMSAnnouncement");
const Discussion  = require("../models/LMSDiscussion");
let sendEmail; try { sendEmail = require("../utils/sendEmail"); } catch (e) { sendEmail = async () => {}; }

const LMS_DIR = path.join(__dirname, "..", "uploads", "lms");
fs.mkdirSync(LMS_DIR, { recursive: true });
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const isStaff = (req) => req.user && ["lms", "instructor", "super_admin"].includes(req.user.role);
function staffOnly(req, res) { if (!isStaff(req)) { res.status(403).json({ msg: "LMS staff only" }); return false; } return true; }

const _upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, LMS_DIR),
    filename:    (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname || "")),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },  // 50 MB per file
});
exports.uploadFilesMw = _upload.array("files", 8);
exports.uploadOneMw   = _upload.single("file");
function mapFile(f) { return { fileName: f.originalname, fileKey: f.filename, fileUrl: "/api/lms/resource/" + f.filename, size: f.size }; }

// ── ASSIGNMENTS ──────────────────────────────────────────────────────────────
exports.listAssignments = async (req, res) => {
  try {
    const q = {}; if (req.query.course && validId(req.query.course)) q.course = req.query.course;
    if (!isStaff(req)) q.isPublished = true;
    const items = await Assignment.find(q).sort({ createdAt: -1 }).populate("course", "title").lean();
    if (!isStaff(req)) {
      const subs = await Submission.find({ student: req.user.id, assignment: { $in: items.map(i => i._id) } }).lean();
      const sm = {}; subs.forEach(s => sm[s.assignment] = s);
      items.forEach(i => i.mySubmission = sm[i._id] || null);
    } else {
      const counts = await Submission.aggregate([
        { $match: { assignment: { $in: items.map(i => i._id) } } },
        { $group: { _id: "$assignment", n: { $sum: 1 }, graded: { $sum: { $cond: [{ $eq: ["$status", "graded"] }, 1, 0] } } } },
      ]);
      const cm = {}; counts.forEach(c => cm[c._id] = c); items.forEach(i => i.subStats = cm[i._id] || { n: 0, graded: 0 });
    }
    return res.json({ assignments: items });
  } catch (e) { console.error("listAssignments:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.createAssignment = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const { course, module, title, description, instructions, maxMarks, dueDate } = req.body;
    if (!validId(course) || !title) return res.status(400).json({ msg: "course and title required" });
    const a = await Assignment.create({ course, module: validId(module) ? module : null, title, description: description || "", instructions: instructions || "", maxMarks: maxMarks || 100, dueDate: dueDate || null, createdBy: req.user.id });
    return res.json({ assignment: a });
  } catch (e) { console.error("createAssignment:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.updateAssignment = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const allow = ["title", "description", "instructions", "maxMarks", "dueDate", "isPublished", "module"];
    const upd = {}; allow.forEach(k => { if (req.body[k] !== undefined) upd[k] = req.body[k]; });
    const a = await Assignment.findByIdAndUpdate(req.params.id, upd, { new: true });
    if (!a) return res.status(404).json({ msg: "Not found" });
    return res.json({ assignment: a });
  } catch (e) { console.error("updateAssignment:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.deleteAssignment = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try { await Submission.deleteMany({ assignment: req.params.id }); await Assignment.findByIdAndDelete(req.params.id); return res.json({ msg: "Deleted" }); }
  catch (e) { console.error("deleteAssignment:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.attachAssignmentFile = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const a = await Assignment.findById(req.params.id); if (!a) return res.status(404).json({ msg: "Not found" });
    (req.files || []).forEach(f => a.attachments.push(mapFile(f)));
    await a.save(); return res.json({ assignment: a });
  } catch (e) { console.error("attachAssignmentFile:", e); return res.status(500).json({ msg: "Server error" }); }
};
// student submit
exports.submitAssignment = async (req, res) => {
  try {
    const a = await Assignment.findById(req.params.id).lean(); if (!a) return res.status(404).json({ msg: "Assignment not found" });
    const late = a.dueDate && new Date() > new Date(a.dueDate);
    const files = (req.files || []).map(mapFile);
    const sub = await Submission.findOneAndUpdate(
      { assignment: a._id, student: req.user.id },
      { $set: { course: a.course, text: req.body.text || "", submittedAt: new Date(), status: late ? "late" : "submitted" }, $push: files.length ? { files: { $each: files } } : {} },
      { upsert: true, new: true, setDefaultsOnInsert: true });
    return res.json({ submission: sub });
  } catch (e) { console.error("submitAssignment:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.listSubmissions = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const subs = await Submission.find({ assignment: req.params.id }).populate("student", "name email").sort({ submittedAt: -1 }).lean();
    return res.json({ submissions: subs });
  } catch (e) { console.error("listSubmissions:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.gradeSubmission = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const upd = { marks: req.body.marks, feedback: req.body.feedback || "", status: "graded", gradedBy: req.user.id, gradedAt: new Date() };
    const s = await Submission.findByIdAndUpdate(req.params.id, upd, { new: true });
    if (!s) return res.status(404).json({ msg: "Not found" });
    return res.json({ submission: s });
  } catch (e) { console.error("gradeSubmission:", e); return res.status(500).json({ msg: "Server error" }); }
};

// ── QUIZZES ──────────────────────────────────────────────────────────────────
exports.listQuizzes = async (req, res) => {
  try {
    const q = {}; if (req.query.course && validId(req.query.course)) q.course = req.query.course;
    if (!isStaff(req)) q.isPublished = true;
    let quizzes = await Quiz.find(q).sort({ createdAt: -1 }).lean();
    if (!isStaff(req)) {
      const attempts = await Attempt.find({ student: req.user.id, quiz: { $in: quizzes.map(x => x._id) } }).lean();
      const am = {}; attempts.forEach(a => { (am[a.quiz] = am[a.quiz] || []).push(a); });
      quizzes = quizzes.map(z => ({ _id: z._id, title: z.title, description: z.description, course: z.course, module: z.module, passMark: z.passMark, timeLimitMin: z.timeLimitMin, attemptsAllowed: z.attemptsAllowed, questionCount: (z.questions || []).length, myAttempts: am[z._id] || [] }));
    }
    return res.json({ quizzes });
  } catch (e) { console.error("listQuizzes:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.getQuiz = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try { const z = await Quiz.findById(req.params.id).lean(); if (!z) return res.status(404).json({ msg: "Not found" }); return res.json({ quiz: z }); }
  catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
exports.createQuiz = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const { course, module, title, description, questions, passMark, timeLimitMin, attemptsAllowed } = req.body;
    if (!validId(course) || !title) return res.status(400).json({ msg: "course and title required" });
    const z = await Quiz.create({ course, module: validId(module) ? module : null, title, description: description || "", questions: questions || [], passMark: passMark != null ? passMark : 50, timeLimitMin: timeLimitMin || 0, attemptsAllowed: attemptsAllowed || 0, createdBy: req.user.id });
    return res.json({ quiz: z });
  } catch (e) { console.error("createQuiz:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.updateQuiz = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const allow = ["title", "description", "questions", "passMark", "timeLimitMin", "attemptsAllowed", "isPublished", "module"];
    const upd = {}; allow.forEach(k => { if (req.body[k] !== undefined) upd[k] = req.body[k]; });
    const z = await Quiz.findByIdAndUpdate(req.params.id, upd, { new: true });
    if (!z) return res.status(404).json({ msg: "Not found" });
    return res.json({ quiz: z });
  } catch (e) { console.error("updateQuiz:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.deleteQuiz = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try { await Attempt.deleteMany({ quiz: req.params.id }); await Quiz.findByIdAndDelete(req.params.id); return res.json({ msg: "Deleted" }); }
  catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
// student take (no answers revealed)
exports.takeQuiz = async (req, res) => {
  try {
    const z = await Quiz.findById(req.params.id).lean(); if (!z || !z.isPublished) return res.status(404).json({ msg: "Quiz not found" });
    if (z.attemptsAllowed > 0) {
      const used = await Attempt.countDocuments({ quiz: z._id, student: req.user.id });
      if (used >= z.attemptsAllowed) return res.status(403).json({ msg: "No attempts remaining" });
    }
    const questions = (z.questions || []).map(q => ({ _id: q._id, q: q.q, options: q.options, marks: q.marks }));
    return res.json({ quiz: { _id: z._id, title: z.title, description: z.description, timeLimitMin: z.timeLimitMin, passMark: z.passMark, questions } });
  } catch (e) { console.error("takeQuiz:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.submitQuiz = async (req, res) => {
  try {
    const z = await Quiz.findById(req.params.id).lean(); if (!z) return res.status(404).json({ msg: "Quiz not found" });
    const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
    let score = 0, total = 0;
    (z.questions || []).forEach((q, i) => { total += q.marks || 1; if (answers[i] === q.correctIndex) score += q.marks || 1; });
    const percent = total ? Math.round(score / total * 100) : 0;
    const passed = percent >= (z.passMark || 0);
    const at = await Attempt.create({ quiz: z._id, course: z.course, student: req.user.id, answers, score, total, percent, passed });
    return res.json({ attempt: at });
  } catch (e) { console.error("submitQuiz:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.listAttempts = async (req, res) => {
  try {
    const q = { quiz: req.params.id };
    if (!isStaff(req)) q.student = req.user.id;
    const attempts = await Attempt.find(q).populate("student", "name email").sort({ submittedAt: -1 }).lean();
    return res.json({ attempts });
  } catch (e) { return res.status(500).json({ msg: "Server error" }); }
};

// ── ANNOUNCEMENTS ────────────────────────────────────────────────────────────
exports.listAnnouncements = async (req, res) => {
  try {
    const or = [{ course: null }];
    if (req.query.course && validId(req.query.course)) or.push({ course: req.query.course });
    const items = await Announce.find({ $or: or }).sort({ createdAt: -1 }).limit(100).populate("course", "title").lean();
    return res.json({ announcements: items });
  } catch (e) { console.error("listAnnouncements:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.createAnnouncement = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const { course, title, body } = req.body;
    if (!title) return res.status(400).json({ msg: "title required" });
    const a = await Announce.create({ course: validId(course) ? course : null, title, body: body || "", postedBy: req.user.id, postedByName: req.user.name || "LMS" });
    return res.json({ announcement: a });
  } catch (e) { console.error("createAnnouncement:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.deleteAnnouncement = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try { await Announce.findByIdAndDelete(req.params.id); return res.json({ msg: "Deleted" }); }
  catch (e) { return res.status(500).json({ msg: "Server error" }); }
};

// ── DISCUSSIONS / DOUBTS ─────────────────────────────────────────────────────
exports.listDiscussions = async (req, res) => {
  try {
    const q = {}; if (req.query.course && validId(req.query.course)) q.course = req.query.course;
    if (!isStaff(req) && req.query.mine === "true") q.student = req.user.id;
    const items = await Discussion.find(q).sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ discussions: items });
  } catch (e) { console.error("listDiscussions:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.createDiscussion = async (req, res) => {
  try {
    const { course, lesson, message } = req.body;
    if (!validId(course) || !message) return res.status(400).json({ msg: "course and message required" });
    const d = await Discussion.create({ course, lesson: validId(lesson) ? lesson : null, student: req.user.id, studentName: req.user.name || req.user.email || "Student", message });
    return res.json({ discussion: d });
  } catch (e) { console.error("createDiscussion:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.replyDiscussion = async (req, res) => {
  try {
    const d = await Discussion.findById(req.params.id); if (!d) return res.status(404).json({ msg: "Not found" });
    if (!req.body.message) return res.status(400).json({ msg: "message required" });
    d.replies.push({ by: req.user.id, byName: req.user.name || req.user.email || "User", role: req.user.role || "", message: req.body.message });
    if (isStaff(req)) d.status = "answered";
    await d.save(); return res.json({ discussion: d });
  } catch (e) { console.error("replyDiscussion:", e); return res.status(500).json({ msg: "Server error" }); }
};

// ── STUDENT PROVISIONING ─────────────────────────────────────────────────────
function genPass() { return "Zx" + crypto.randomBytes(4).toString("hex") + "!" + Math.floor(10 + Math.random() * 89); }
async function createStudent(email, name) {
  email = String(email).toLowerCase().trim();
  let user = await User.findOne({ email });
  const tempPassword = genPass();
  const hash = await bcrypt.hash(tempPassword, 10);
  if (user) {
    if (user.role !== "super_admin") user.role = "student";
    user.active = true; await user.save();
    return { email, created: false, tempPassword: null, name: user.name };
  }
  user = await User.create({ name: name || email.split("@")[0], email, password: hash, role: "student", active: true });
  return { email, created: true, tempPassword, name: user.name };
}
async function emailCreds(email, name, pass) {
  const url = "https://zyntrixsoftware.com/crm/index.html";
  const text = `Hello ${name || "Student"},\n\nYour Zyntrix LMS account is ready.\n\nPortal : ${url}\nEmail  : ${email}\nPassword: ${pass}\n\nPlease log in and change your password using "Forgot password" if you wish.\n\n— Zyntrix LMS`;
  try { await sendEmail(email, "Your Zyntrix LMS Login", text); return true; } catch (e) { console.warn("provision email failed", email, e.message); return false; }
}
// provision one
exports.provisionStudent = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    if (!email || !email.includes("@")) return res.status(400).json({ msg: "Valid email required" });
    const r = await createStudent(email, req.body.name);
    let emailed = false;
    if (r.created && r.tempPassword) emailed = await emailCreds(email, r.name, r.tempPassword);
    return res.json({ ...r, emailed });
  } catch (e) { console.error("provisionStudent:", e); return res.status(500).json({ msg: "Server error" }); }
};
// provision all enrolled students that have no login yet
exports.provisionAll = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const enrs = await Enrollment.find({ status: { $in: ["active", "handed_off"] } }).populate("lead", "fullName email").lean();
    const seen = new Set(); let created = 0, existing = 0, emailed = 0;
    for (const e of enrs) {
      const email = e.lead && e.lead.email ? e.lead.email.toLowerCase().trim() : "";
      if (!email || seen.has(email)) continue; seen.add(email);
      const r = await createStudent(email, e.lead.fullName);
      if (r.created) { created++; if (r.tempPassword && await emailCreds(email, r.name, r.tempPassword)) emailed++; }
      else existing++;
    }
    return res.json({ msg: `Provisioned ${created} new student logins (${existing} already existed). Emails sent: ${emailed}.`, created, existing, emailed });
  } catch (e) { console.error("provisionAll:", e); return res.status(500).json({ msg: "Server error" }); }
};
