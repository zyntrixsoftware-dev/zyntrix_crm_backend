const express = require("express");
const {
  getCandidates,
  bulkImport,
  shortlistCandidate,
  rejectCandidate,
  deleteCandidate,
  importFromLink,
  applyForJob,
  uploadResumeMw,
  downloadResume
} = require("../controllers/candidateController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// ── PUBLIC — no auth required ───────────────────────────────────────────────
// This replaces the direct GAS web-app POST and avoids browser CORS errors.
router.post("/apply", uploadResumeMw, applyForJob);

// Resume download — token-gated inside the handler (header or ?token=)
router.get("/resume/:id", downloadResume);

// ── HR only ─────────────────────────────────────────────────────────────────
router.get   ("/candidates",                   auth, getCandidates);
router.post  ("/candidates/bulk-import",       auth, bulkImport);
router.post  ("/candidates/import-from-link",  auth, importFromLink);
router.post  ("/candidates/:id/shortlist",     auth, shortlistCandidate);
router.patch ("/candidates/:id/reject",        auth, rejectCandidate);
router.delete("/candidates/:id",               auth, deleteCandidate);

module.exports = router;
