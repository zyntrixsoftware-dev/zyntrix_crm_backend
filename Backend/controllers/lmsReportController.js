const crypto   = require("crypto");
const mongoose = require("mongoose");
const User        = require("../models/user");
const Course      = require("../models/Course");
const Enrollment  = require("../models/Enrollment");
const StudentLead = require("../models/StudentLead");
const Lesson      = require("../models/LMSLesson");
const Progress    = require("../models/LMSProgress");
const Assignment  = require("../models/LMSAssignment");
const Submission  = require("../models/LMSSubmission");
const Quiz        = require("../models/LMSQuiz");
const Attempt     = require("../models/LMSQuizAttempt");
const Session     = require("../models/LMSClassSession");
const Attendance  = require("../models/LMSAttendance");
const Certificate = require("../models/LMSCertificate");
let sendEmail; try { sendEmail = require("../utils/sendEmail"); } catch (e) { sendEmail = async () => {}; }

const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const isStaff = (req) => req.user && ["lms", "instructor", "super_admin"].includes(req.user.role);
function staffOnly(req, res) { if (!isStaff(req)) { res.status(403).json({ msg: "LMS staff only" }); return false; } return true; }

async function enrolledStudents(courseId) {
  const enrs = await Enrollment.find({ course: courseId, status: { $in: ["active", "handed_off"] } }).populate("lead", "fullName email").lean();
  const emails = [...new Set(enrs.map(e => e.lead && e.lead.email ? e.lead.email.toLowerCase() : "").filter(Boolean))];
  if (!emails.length) return [];
  return User.find({ email: { $in: emails } }).select("name email").lean();
}

// ── GRADEBOOK: per-student metrics for a course ──────────────────────────────
exports.gradebook = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const courseId = req.query.course;
    if (!validId(courseId)) return res.status(400).json({ msg: "course required" });
    const students = await enrolledStudents(courseId);
    const sids = students.map(s => s._id);
    const totalLessons = await Lesson.countDocuments({ course: courseId, isPublished: true });
    const assignments  = await Assignment.find({ course: courseId }).select("maxMarks").lean();
    const amax = {}; assignments.forEach(a => amax[a._id] = a.maxMarks || 100);
    const totalSessions = await Session.countDocuments({ course: courseId });
    const quizzes = await Quiz.find({ course: courseId }).select("_id").lean();
    const certs = await Certificate.find({ course: courseId, student: { $in: sids } }).lean();
    const certSet = new Set(certs.map(c => String(c.student)));

    const [prog, subs, atts, attend] = await Promise.all([
      Progress.find({ course: courseId, student: { $in: sids }, status: "completed" }).lean(),
      Submission.find({ course: courseId, student: { $in: sids }, status: "graded" }).lean(),
      Attempt.find({ course: courseId, student: { $in: sids } }).lean(),
      Attendance.find({ course: courseId, student: { $in: sids } }).lean(),
    ]);
    const pc = {}; prog.forEach(p => pc[p.student] = (pc[p.student] || 0) + 1);
    const sm = {}; subs.forEach(s => { (sm[s.student] = sm[s.student] || []).push((s.marks || 0) / (amax[s.assignment] || 100) * 100); });
    const qm = {}; atts.forEach(a => { const k = a.student + "|" + a.quiz; qm[k] = Math.max(qm[k] || 0, a.percent || 0); });
    const qbystu = {}; Object.keys(qm).forEach(k => { const st = k.split("|")[0]; (qbystu[st] = qbystu[st] || []).push(qm[k]); });
    const at = {}; attend.forEach(a => { at[a.student] = at[a.student] || { present: 0, total: 0 }; at[a.student].total++; if (a.status !== "absent") at[a.student].present++; });

    const avg = arr => arr && arr.length ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : null;
    const rows = students.map(s => {
      const id = String(s._id);
      const progPct = totalLessons ? Math.round((pc[id] || 0) / totalLessons * 100) : 0;
      const aAvg = avg(sm[id]);
      const qAvg = avg(qbystu[id]);
      const attRow = at[id]; const attPct = totalSessions ? Math.round(((attRow ? attRow.present : 0)) / totalSessions * 100) : null;
      return { student: s._id, name: s.name, email: s.email, progressPct: progPct,
        assignmentAvg: aAvg, quizAvg: qAvg, attendancePct: attPct, certified: certSet.has(id) };
    });
    return res.json({ rows, totals: { lessons: totalLessons, assignments: assignments.length, quizzes: quizzes.length, sessions: totalSessions } });
  } catch (e) { console.error("gradebook:", e); return res.status(500).json({ msg: "Server error" }); }
};

// ── REPORTS: course-level analytics ──────────────────────────────────────────
exports.reports = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const courses = await Course.find({ isActive: true }).select("title").lean();
    const out = [];
    let totLearners = 0, totCompleted = 0, totCerts = await Certificate.countDocuments({});
    for (const c of courses) {
      const students = await enrolledStudents(c._id);
      const sids = students.map(s => s._id);
      const totalLessons = await Lesson.countDocuments({ course: c._id, isPublished: true });
      let completed = 0;
      if (totalLessons && sids.length) {
        const prog = await Progress.aggregate([
          { $match: { course: c._id, student: { $in: sids }, status: "completed" } },
          { $group: { _id: "$student", n: { $sum: 1 } } },
        ]);
        completed = prog.filter(p => p.n >= totalLessons).length;
      }
      const attempts = await Attempt.find({ course: c._id }).select("passed").lean();
      const passRate = attempts.length ? Math.round(attempts.filter(a => a.passed).length / attempts.length * 100) : null;
      out.push({ course: c.title, learners: students.length, lessons: totalLessons, completed, quizPassRate: passRate });
      totLearners += students.length; totCompleted += completed;
    }
    return res.json({ courses: out, totals: { courses: courses.length, learners: totLearners, completed: totCompleted, certificates: totCerts } });
  } catch (e) { console.error("reports:", e); return res.status(500).json({ msg: "Server error" }); }
};

// ── CERTIFICATES ─────────────────────────────────────────────────────────────
function certNo() { return "ZX-" + new Date().getFullYear() + "-" + crypto.randomBytes(3).toString("hex").toUpperCase(); }
exports.issueCertificate = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const { student, course } = req.body;
    if (!validId(student) || !validId(course)) return res.status(400).json({ msg: "student and course required" });
    let cert = await Certificate.findOne({ student, course });
    if (cert) return res.json({ certificate: cert, already: true });
    const u = await User.findById(student).select("name email").lean();
    const c = await Course.findById(course).select("title").lean();
    cert = await Certificate.create({ student, course, certificateNo: certNo(), studentName: u ? u.name : "", courseTitle: c ? c.title : "", issuedBy: req.user.id });
    if (u && u.email) {
      const url = "https://zyntrixsoftware.com/crm/modules/lms_system/certificate.html?id=" + cert._id;
      sendEmail(u.email, "Your Zyntrix Certificate — " + (c ? c.title : ""), `Congratulations ${u.name || ""}!\n\nYou have been awarded a certificate of completion for "${c ? c.title : "your course"}".\n\nCertificate No: ${cert.certificateNo}\nView / download: ${url}\n\n— Zyntrix LMS`).catch(e => console.warn("cert email", e.message));
    }
    return res.json({ certificate: cert });
  } catch (e) { console.error("issueCertificate:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.listCertificates = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const q = {}; if (req.query.course && validId(req.query.course)) q.course = req.query.course;
    const items = await Certificate.find(q).sort({ issuedAt: -1 }).populate("course", "title").lean();
    return res.json({ certificates: items });
  } catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
exports.myCertificates = async (req, res) => {
  try {
    const items = await Certificate.find({ student: req.user.id }).sort({ issuedAt: -1 }).populate("course", "title").lean();
    return res.json({ certificates: items });
  } catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
exports.getCertificate = async (req, res) => {
  try {
    const cert = await Certificate.findById(req.params.id).lean();
    if (!cert) return res.status(404).json({ msg: "Not found" });
    if (!isStaff(req) && String(cert.student) !== String(req.user.id)) return res.status(403).json({ msg: "Not yours" });
    return res.json({ certificate: cert });
  } catch (e) { return res.status(500).json({ msg: "Server error" }); }
};
