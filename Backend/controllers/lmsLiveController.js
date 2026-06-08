const mongoose = require("mongoose");
const User        = require("../models/user");
const Enrollment  = require("../models/Enrollment");
const StudentLead = require("../models/StudentLead");
const Session     = require("../models/LMSClassSession");
const Attendance  = require("../models/LMSAttendance");

const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const isStaff = (req) => req.user && ["lms", "instructor", "super_admin"].includes(req.user.role);
function staffOnly(req, res) { if (!isStaff(req)) { res.status(403).json({ msg: "LMS staff only" }); return false; } return true; }

// All student User accounts enrolled in a course (mapped by email)
async function enrolledStudents(courseId) {
  const enrs = await Enrollment.find({ course: courseId, status: { $in: ["active", "handed_off"] } }).populate("lead", "fullName email").lean();
  const emails = [...new Set(enrs.map(e => e.lead && e.lead.email ? e.lead.email.toLowerCase() : "").filter(Boolean))];
  if (!emails.length) return [];
  return User.find({ email: { $in: emails } }).select("name email").lean();
}
async function myCourseIds(email) {
  if (!email) return [];
  const leads = await StudentLead.find({ email: String(email).toLowerCase() }).select("_id").lean();
  const ids = leads.map(l => l._id); if (!ids.length) return [];
  const enrs = await Enrollment.find({ lead: { $in: ids }, status: { $in: ["active", "handed_off"] } }).select("course").lean();
  return [...new Set(enrs.map(e => String(e.course)))];
}

// ── list sessions for a course ───────────────────────────────────────────────
exports.listSessions = async (req, res) => {
  try {
    const q = {}; if (req.query.course && validId(req.query.course)) q.course = req.query.course;
    const sessions = await Session.find(q).sort({ scheduledAt: -1 }).populate("course", "title").lean();
    if (!isStaff(req)) {
      const att = await Attendance.find({ student: req.user.id, session: { $in: sessions.map(s => s._id) } }).lean();
      const am = {}; att.forEach(a => am[a.session] = a.status);
      sessions.forEach(s => s.myAttendance = am[s._id] || null);
    }
    return res.json({ sessions });
  } catch (e) { console.error("listSessions:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.createSession = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const { course, title, description, scheduledAt, durationMin, joinUrl, instructorName } = req.body;
    if (!validId(course) || !title || !scheduledAt) return res.status(400).json({ msg: "course, title, scheduledAt required" });
    const s = await Session.create({ course, title, description: description || "", scheduledAt, durationMin: durationMin || 60, joinUrl: joinUrl || "", instructorName: instructorName || (req.user.name || ""), createdBy: req.user.id });
    return res.json({ session: s });
  } catch (e) { console.error("createSession:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.updateSession = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const allow = ["title", "description", "scheduledAt", "durationMin", "joinUrl", "recordingUrl", "instructorName", "status"];
    const upd = {}; allow.forEach(k => { if (req.body[k] !== undefined) upd[k] = req.body[k]; });
    const s = await Session.findByIdAndUpdate(req.params.id, upd, { new: true });
    if (!s) return res.status(404).json({ msg: "Not found" });
    return res.json({ session: s });
  } catch (e) { console.error("updateSession:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.deleteSession = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try { await Attendance.deleteMany({ session: req.params.id }); await Session.findByIdAndDelete(req.params.id); return res.json({ msg: "Deleted" }); }
  catch (e) { return res.status(500).json({ msg: "Server error" }); }
};

// ── attendance (staff) ───────────────────────────────────────────────────────
exports.sessionAttendance = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const s = await Session.findById(req.params.id).lean(); if (!s) return res.status(404).json({ msg: "Not found" });
    const students = await enrolledStudents(s.course);
    const att = await Attendance.find({ session: s._id }).lean();
    const am = {}; att.forEach(a => am[a.student] = a.status);
    const roster = students.map(st => ({ student: st._id, name: st.name, email: st.email, status: am[st._id] || "" }));
    return res.json({ session: s, roster });
  } catch (e) { console.error("sessionAttendance:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.markAttendance = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const s = await Session.findById(req.params.id).lean(); if (!s) return res.status(404).json({ msg: "Not found" });
    const records = Array.isArray(req.body.records) ? req.body.records : [];
    for (const r of records) {
      if (!validId(r.student) || !r.status) continue;
      await Attendance.findOneAndUpdate(
        { session: s._id, student: r.student },
        { $set: { course: s.course, status: r.status, markedBy: req.user.id, source: "staff" } },
        { upsert: true });
    }
    return res.json({ msg: "Attendance saved", count: records.length });
  } catch (e) { console.error("markAttendance:", e); return res.status(500).json({ msg: "Server error" }); }
};

// ── student ──────────────────────────────────────────────────────────────────
exports.mySessions = async (req, res) => {
  try {
    const courseIds = await myCourseIds(req.user.email);
    if (!courseIds.length) return res.json({ sessions: [] });
    const sessions = await Session.find({ course: { $in: courseIds } }).sort({ scheduledAt: -1 }).populate("course", "title").lean();
    const att = await Attendance.find({ student: req.user.id, session: { $in: sessions.map(s => s._id) } }).lean();
    const am = {}; att.forEach(a => am[a.session] = a.status);
    sessions.forEach(s => s.myAttendance = am[s._id] || null);
    return res.json({ sessions });
  } catch (e) { console.error("mySessions:", e); return res.status(500).json({ msg: "Server error" }); }
};
// student marks self present (on join)
exports.attendSession = async (req, res) => {
  try {
    const s = await Session.findById(req.params.id).lean(); if (!s) return res.status(404).json({ msg: "Not found" });
    const late = new Date() > new Date(new Date(s.scheduledAt).getTime() + 10 * 60000);
    await Attendance.findOneAndUpdate(
      { session: s._id, student: req.user.id },
      { $set: { course: s.course, status: late ? "late" : "present", source: "self" } },
      { upsert: true });
    return res.json({ ok: true, joinUrl: s.joinUrl });
  } catch (e) { console.error("attendSession:", e); return res.status(500).json({ msg: "Server error" }); }
};
