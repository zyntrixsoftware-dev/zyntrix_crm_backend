const express = require("express");
const jwt     = require("jsonwebtoken");
const router  = express.Router();
const C       = require("../controllers/lmsController");
const A       = require("../controllers/lmsActivityController");
const L       = require("../controllers/lmsLiveController");
const R       = require("../controllers/lmsReportController");

// Auth that accepts a Bearer header OR ?token= (so <video src> and downloads work)
function auth(req, res, next) {
  const token = (req.headers.authorization && req.headers.authorization.split(" ")[1]) || req.query.token;
  if (!token) return res.status(401).json({ msg: "No token" });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch (e) { return res.status(401).json({ msg: "Invalid token" }); }
}
router.use(auth);

// Staff dashboard / roster
router.get("/dashboard", C.dashboard);
router.get("/roster",    C.roster);

// Catalogue + content
router.get("/courses",                  C.listCourses);
router.get("/courses/:courseId/content", C.getCourseContent);

// Modules (staff)
router.post  ("/modules",     C.createModule);
router.patch ("/modules/:id", C.updateModule);
router.delete("/modules/:id", C.deleteModule);

// Lessons (staff)
router.post  ("/lessons",            C.createLesson);
router.patch ("/lessons/:id",        C.updateLesson);
router.delete("/lessons/:id",        C.deleteLesson);
router.post  ("/lessons/:id/video",    C.uploadVideoMw,    C.uploadVideo);
router.get   ("/lessons/:id/video",    C.streamVideo);
router.post  ("/lessons/:id/resource", C.uploadResourceMw, C.uploadResource);
router.get   ("/resource/:key",        C.downloadResource);

// Student
router.get  ("/my/courses",            C.myCourses);
router.get  ("/my/courses/:courseId",  C.coursePlayer);
router.post ("/lessons/:id/complete",  C.markComplete);
router.patch("/lessons/:id/progress",  C.saveProgress);

// ── Phase 2: Assignments ─────────────────────────────────────
router.get   ("/assignments",                 A.listAssignments);
router.post  ("/assignments",                 A.createAssignment);
router.patch ("/assignments/:id",             A.updateAssignment);
router.delete("/assignments/:id",             A.deleteAssignment);
router.post  ("/assignments/:id/attach",      A.uploadFilesMw, A.attachAssignmentFile);
router.post  ("/assignments/:id/submit",      A.uploadFilesMw, A.submitAssignment);
router.get   ("/assignments/:id/submissions", A.listSubmissions);
router.patch ("/submissions/:id/grade",       A.gradeSubmission);

// ── Phase 2: Quizzes ─────────────────────────────────────────
router.get   ("/quizzes",            A.listQuizzes);
router.post  ("/quizzes",            A.createQuiz);
router.get   ("/quizzes/:id",        A.getQuiz);
router.patch ("/quizzes/:id",        A.updateQuiz);
router.delete("/quizzes/:id",        A.deleteQuiz);
router.get   ("/quizzes/:id/take",   A.takeQuiz);
router.post  ("/quizzes/:id/attempt",A.submitQuiz);
router.get   ("/quizzes/:id/attempts",A.listAttempts);

// ── Phase 2: Announcements ───────────────────────────────────
router.get   ("/announcements",     A.listAnnouncements);
router.post  ("/announcements",     A.createAnnouncement);
router.delete("/announcements/:id", A.deleteAnnouncement);

// ── Phase 2: Discussions / Doubts ────────────────────────────
router.get ("/discussions",          A.listDiscussions);
router.post("/discussions",          A.createDiscussion);
router.post("/discussions/:id/reply",A.replyDiscussion);

// ── Phase 2: Student provisioning ────────────────────────────
router.post("/students/provision",     A.provisionStudent);
router.post("/students/provision-all",  A.provisionAll);

// ── Phase 3: Live classes + attendance ───────────────────────
router.get   ("/sessions",                 L.listSessions);
router.post  ("/sessions",                 L.createSession);
router.patch ("/sessions/:id",             L.updateSession);
router.delete("/sessions/:id",             L.deleteSession);
router.get   ("/sessions/:id/attendance",  L.sessionAttendance);
router.post  ("/sessions/:id/attendance",  L.markAttendance);
router.post  ("/sessions/:id/attend",      L.attendSession);
router.get   ("/my/sessions",              L.mySessions);

// ── Phase 4: Gradebook, reports, certificates ────────────────
router.get ("/gradebook",          R.gradebook);
router.get ("/reports",            R.reports);
router.get ("/certificates",       R.listCertificates);
router.post("/certificates",       R.issueCertificate);
router.get ("/my/certificates",    R.myCertificates);
router.get ("/certificates/:id",   R.getCertificate);

module.exports = router;
