const express = require("express");
const multer  = require("multer");

const {
  getMyProfile,
  updateMyProfile,
  uploadMyPhoto,
  servePhoto,
  deleteMyPhoto
} = require("../controllers/employeeController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// In-memory multer — the buffer is streamed straight into GridFS by the
// controller, so we do not need any temp files on disk. 10 MB cap as a hard
// outer safety net; the controller enforces 8 MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }
});

// ── Self-service profile (logged-in employee) ──────────────────────────────
router.get("/profile", auth, getMyProfile);
router.put("/profile", auth, updateMyProfile);

// ── Profile photo (GridFS) ─────────────────────────────────────────────────
// Upload / replace — multipart/form-data with field "photo"
router.post  ("/photo", auth, upload.single("photo"), uploadMyPhoto);
router.delete("/photo", auth, deleteMyPhoto);

// Public-ish view URL — used by <img src="/api/employee/photo/<userId>">.
// Auth-optional so img tags work without custom headers; the URL needs to
// know the userId, which is only available to logged-in views.
router.get("/photo/:userId", servePhoto);

module.exports = router;
