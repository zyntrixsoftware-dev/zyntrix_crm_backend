const express = require("express");
const jwt     = require("jsonwebtoken");
const router  = express.Router();
const C       = require("../controllers/lmsController");

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

module.exports = router;
