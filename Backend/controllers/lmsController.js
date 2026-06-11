const fs       = require("fs");
const path     = require("path");
const crypto   = require("crypto");
const multer   = require("multer");
const mongoose = require("mongoose");

const Course      = require("../models/Course");
const Enrollment  = require("../models/Enrollment");
const StudentLead = require("../models/StudentLead");
const LMSModule   = require("../models/LMSModule");
const LMSLesson   = require("../models/LMSLesson");
const LMSProgress = require("../models/LMSProgress");

const LMS_DIR = path.join(__dirname, "..", "uploads", "lms");
fs.mkdirSync(LMS_DIR, { recursive: true });

// Map a video filename to a browser-friendly MIME type. Browsers refuse to play
// when served as application/octet-stream, so derive it from the extension.
const VIDEO_MIME = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm",
  ".ogg": "video/ogg", ".ogv": "video/ogg", ".mov": "video/quicktime",
  ".mkv": "video/x-matroska", ".avi": "video/x-msvideo", ".m3u8": "application/vnd.apple.mpegurl"
};
function videoMimeFor(filename, current) {
  if (current && current !== "application/octet-stream" && current !== "binary/octet-stream") return current;
  return VIDEO_MIME[path.extname(filename || "").toLowerCase()] || "video/mp4";
}

const validId  = (id) => mongoose.Types.ObjectId.isValid(id);
const isStaff  = (req) => req.user && ["lms", "instructor", "super_admin"].includes(req.user.role);
function staffOnly(req, res) {
  if (!isStaff(req)) { res.status(403).json({ msg: "LMS staff only" }); return false; }
  return true;
}

// ── Uploads (video + resources) ──────────────────────────────────────────────
const _upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, LMS_DIR),
    filename:    (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname || "")),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 },  // 1 GB
});
exports.uploadVideoMw    = _upload.single("video");
exports.uploadResourceMw = _upload.single("file");

// ── CONTENT: read ────────────────────────────────────────────────────────────
// GET /lms/courses/:courseId/content  → modules (with lessons)
exports.getCourseContent = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!validId(courseId)) return res.status(400).json({ msg: "Invalid course id" });
    const staff = isStaff(req);
    const modQ = { course: courseId }; if (!staff) modQ.isPublished = true;
    const modules = await LMSModule.find(modQ).sort({ order: 1, createdAt: 1 }).lean();
    const lesQ = { course: courseId }; if (!staff) lesQ.isPublished = true;
    const lessons = await LMSLesson.find(lesQ).sort({ order: 1, createdAt: 1 }).lean();
    // strip heavy/secret fields for students; keep flags
    const byMod = {};
    lessons.forEach(l => { (byMod[l.module] = byMod[l.module] || []).push(l); });
    const out = modules.map(m => ({ ...m, lessons: byMod[m._id] || [] }));
    return res.json({ modules: out });
  } catch (e) { console.error("getCourseContent:", e); return res.status(500).json({ msg: "Server error" }); }
};

// ── MODULES (staff) ──────────────────────────────────────────────────────────
exports.createModule = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const { course, title, description, order } = req.body;
    if (!validId(course) || !title) return res.status(400).json({ msg: "course and title required" });
    const count = await LMSModule.countDocuments({ course });
    const m = await LMSModule.create({ course, title, description: description || "", order: order != null ? order : count, createdBy: req.user.id });
    return res.json({ module: m });
  } catch (e) { console.error("createModule:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.updateModule = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const allow = ["title", "description", "order", "isPublished"];
    const upd = {}; allow.forEach(k => { if (req.body[k] !== undefined) upd[k] = req.body[k]; });
    const m = await LMSModule.findByIdAndUpdate(req.params.id, upd, { new: true });
    if (!m) return res.status(404).json({ msg: "Module not found" });
    return res.json({ module: m });
  } catch (e) { console.error("updateModule:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.deleteModule = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    await LMSLesson.deleteMany({ module: req.params.id });
    await LMSModule.findByIdAndDelete(req.params.id);
    return res.json({ msg: "Module deleted" });
  } catch (e) { console.error("deleteModule:", e); return res.status(500).json({ msg: "Server error" }); }
};

// ── LESSONS (staff) ──────────────────────────────────────────────────────────
exports.createLesson = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const { module: moduleId, title, type, videoUrl, content, durationMin, isPreview } = req.body;
    if (!validId(moduleId) || !title) return res.status(400).json({ msg: "module and title required" });
    const mod = await LMSModule.findById(moduleId);
    if (!mod) return res.status(404).json({ msg: "Module not found" });
    const count = await LMSLesson.countDocuments({ module: moduleId });
    const l = await LMSLesson.create({
      module: moduleId, course: mod.course, title,
      type: type || "video", videoUrl: videoUrl || "", content: content || "",
      durationMin: durationMin || 0, isPreview: !!isPreview, order: count, createdBy: req.user.id,
    });
    return res.json({ lesson: l });
  } catch (e) { console.error("createLesson:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.updateLesson = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const allow = ["title", "type", "videoUrl", "content", "durationMin", "order", "isPreview", "isPublished"];
    const upd = {}; allow.forEach(k => { if (req.body[k] !== undefined) upd[k] = req.body[k]; });
    const l = await LMSLesson.findByIdAndUpdate(req.params.id, upd, { new: true });
    if (!l) return res.status(404).json({ msg: "Lesson not found" });
    return res.json({ lesson: l });
  } catch (e) { console.error("updateLesson:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.deleteLesson = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const l = await LMSLesson.findById(req.params.id);
    if (l && l.videoFile) { try { fs.unlinkSync(path.join(LMS_DIR, l.videoFile)); } catch (_) {} }
    await LMSLesson.findByIdAndDelete(req.params.id);
    return res.json({ msg: "Lesson deleted" });
  } catch (e) { console.error("deleteLesson:", e); return res.status(500).json({ msg: "Server error" }); }
};

// POST /lms/lessons/:id/video  (staff, multipart "video")
exports.uploadVideo = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    if (!req.file) return res.status(400).json({ msg: "No video file" });
    const l = await LMSLesson.findById(req.params.id);
    if (!l) { try { fs.unlinkSync(req.file.path); } catch (_) {} return res.status(404).json({ msg: "Lesson not found" }); }
    if (l.videoFile) { try { fs.unlinkSync(path.join(LMS_DIR, l.videoFile)); } catch (_) {} }
    l.videoFile = req.file.filename; l.videoMime = videoMimeFor(req.file.filename, req.file.mimetype); l.type = "video";
    await l.save();
    return res.json({ msg: "Video uploaded", lesson: l });
  } catch (e) { console.error("uploadVideo:", e); return res.status(500).json({ msg: "Server error" }); }
};

// GET /lms/lessons/:id/video  → range-stream (auth)
exports.streamVideo = async (req, res) => {
  try {
    const l = await LMSLesson.findById(req.params.id);
    if (!l || !l.videoFile) return res.status(404).json({ msg: "No video" });
    const fp = path.join(LMS_DIR, l.videoFile);
    if (!fs.existsSync(fp)) return res.status(404).json({ msg: "File missing" });
    const stat = fs.statSync(fp); const total = stat.size; const mime = videoMimeFor(l.videoFile, l.videoMime);
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : total - 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": mime,
      });
      fs.createReadStream(fp, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "Content-Length": total, "Content-Type": mime, "Accept-Ranges": "bytes" });
      fs.createReadStream(fp).pipe(res);
    }
  } catch (e) { console.error("streamVideo:", e); return res.status(500).json({ msg: "Server error" }); }
};

// POST /lms/lessons/:id/resource (staff, multipart "file")
exports.uploadResource = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    if (!req.file) return res.status(400).json({ msg: "No file" });
    const l = await LMSLesson.findById(req.params.id);
    if (!l) { try { fs.unlinkSync(req.file.path); } catch (_) {} return res.status(404).json({ msg: "Lesson not found" }); }
    l.resources.push({ fileName: req.file.originalname, fileKey: req.file.filename, fileUrl: "/api/lms/resource/" + req.file.filename, size: req.file.size });
    await l.save();
    return res.json({ lesson: l });
  } catch (e) { console.error("uploadResource:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.downloadResource = async (req, res) => {
  try {
    const fp = path.join(LMS_DIR, path.basename(req.params.key));
    if (!fs.existsSync(fp)) return res.status(404).json({ msg: "Not found" });
    return res.download(fp);
  } catch (e) { console.error("downloadResource:", e); return res.status(500).json({ msg: "Server error" }); }
};

// ── CATALOGUE ────────────────────────────────────────────────────────────────
exports.listCourses = async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true }).sort({ createdAt: -1 }).lean();
    const ids = courses.map(c => c._id);
    const counts = await LMSLesson.aggregate([
      { $match: { course: { $in: ids }, isPublished: true } },
      { $group: { _id: "$course", n: { $sum: 1 } } },
    ]);
    const cm = {}; counts.forEach(c => cm[c._id] = c.n);
    return res.json({ courses: courses.map(c => ({ ...c, lessonCount: cm[c._id] || 0 })) });
  } catch (e) { console.error("listCourses:", e); return res.status(500).json({ msg: "Server error" }); }
};

// ── STUDENT: my courses (mapped by email → leads → enrollments) ──────────────
async function myEnrollments(email) {
  if (!email) return [];
  const leads = await StudentLead.find({ email: String(email).toLowerCase() }).select("_id").lean();
  const leadIds = leads.map(l => l._id);
  if (!leadIds.length) return [];
  return Enrollment.find({ lead: { $in: leadIds }, status: { $in: ["active", "handed_off"] } })
    .populate("course", "title description category level durationWeeks").lean();
}
async function courseProgress(studentId, courseId) {
  const total = await LMSLesson.countDocuments({ course: courseId, isPublished: true });
  if (!total) return { pct: 0, completed: 0, total: 0 };
  const completed = await LMSProgress.countDocuments({ student: studentId, course: courseId, status: "completed" });
  return { pct: Math.round(completed / total * 100), completed, total };
}

exports.myCourses = async (req, res) => {
  try {
    const enrs = await myEnrollments(req.user.email);
    const out = [];
    for (const e of enrs) {
      if (!e.course) continue;
      const p = await courseProgress(req.user.id, e.course._id);
      out.push({ enrollmentId: e._id, course: e.course, progress: p, enrolledAt: e.enrolledAt });
    }
    return res.json({ courses: out });
  } catch (e) { console.error("myCourses:", e); return res.status(500).json({ msg: "Server error" }); }
};

// GET /lms/my/courses/:courseId  → content + my progress map
exports.coursePlayer = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!validId(courseId)) return res.status(400).json({ msg: "Invalid course id" });
    const course = await Course.findById(courseId).lean();
    if (!course) return res.status(404).json({ msg: "Course not found" });
    const modules = await LMSModule.find({ course: courseId, isPublished: true }).sort({ order: 1 }).lean();
    const lessons = await LMSLesson.find({ course: courseId, isPublished: true }).sort({ order: 1 }).lean();
    const prog = await LMSProgress.find({ student: req.user.id, course: courseId }).lean();
    const pmap = {}; prog.forEach(p => pmap[p.lesson] = { status: p.status, lastPositionSec: p.lastPositionSec });
    const byMod = {};
    lessons.forEach(l => {
      (byMod[l.module] = byMod[l.module] || []).push({
        _id: l._id, title: l.title, type: l.type, durationMin: l.durationMin,
        hasVideo: !!(l.videoFile || l.videoUrl), videoUrl: l.videoUrl, videoFile: !!l.videoFile,
        content: l.content, resources: l.resources, order: l.order,
        progress: pmap[l._id] || { status: "not_started", lastPositionSec: 0 },
      });
    });
    const out = modules.map(m => ({ _id: m._id, title: m.title, description: m.description, lessons: byMod[m._id] || [] }));
    const p = await courseProgress(req.user.id, courseId);
    return res.json({ course, modules: out, progress: p });
  } catch (e) { console.error("coursePlayer:", e); return res.status(500).json({ msg: "Server error" }); }
};

exports.markComplete = async (req, res) => {
  try {
    const l = await LMSLesson.findById(req.params.id).lean();
    if (!l) return res.status(404).json({ msg: "Lesson not found" });
    await LMSProgress.findOneAndUpdate(
      { student: req.user.id, lesson: l._id },
      { $set: { course: l.course, status: "completed", completedAt: new Date() } },
      { upsert: true, new: true });
    const p = await courseProgress(req.user.id, l.course);
    return res.json({ msg: "Marked complete", progress: p });
  } catch (e) { console.error("markComplete:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.saveProgress = async (req, res) => {
  try {
    const l = await LMSLesson.findById(req.params.id).lean();
    if (!l) return res.status(404).json({ msg: "Lesson not found" });
    const pos = Number(req.body.lastPositionSec) || 0;
    await LMSProgress.findOneAndUpdate(
      { student: req.user.id, lesson: l._id },
      { $set: { course: l.course, lastPositionSec: pos }, $setOnInsert: { status: "in_progress" } },
      { upsert: true });
    return res.json({ ok: true });
  } catch (e) { console.error("saveProgress:", e); return res.status(500).json({ msg: "Server error" }); }
};

// ── STAFF: roster + dashboard ────────────────────────────────────────────────
exports.roster = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const q = { status: { $in: ["active", "handed_off"] } };
    if (req.query.course && validId(req.query.course)) q.course = req.query.course;
    const enrs = await Enrollment.find(q).populate("lead", "fullName email phone").populate("course", "title").lean();
    const out = [];
    for (const e of enrs) {
      const p = await courseProgress(null, e.course ? e.course._id : null).catch(() => ({ pct: 0 }));
      out.push({ _id: e._id, student: e.lead, course: e.course, enrolledAt: e.enrolledAt, status: e.status });
    }
    return res.json({ roster: out });
  } catch (e) { console.error("roster:", e); return res.status(500).json({ msg: "Server error" }); }
};
exports.dashboard = async (req, res) => {
  if (!staffOnly(req, res)) return;
  try {
    const [courses, modules, lessons, learners, completions] = await Promise.all([
      Course.countDocuments({ isActive: true }),
      LMSModule.countDocuments({}),
      LMSLesson.countDocuments({}),
      Enrollment.countDocuments({ status: { $in: ["active", "handed_off"] } }),
      LMSProgress.countDocuments({ status: "completed" }),
    ]);
    return res.json({ courses, modules, lessons, learners, completions });
  } catch (e) { console.error("dashboard:", e); return res.status(500).json({ msg: "Server error" }); }
};
