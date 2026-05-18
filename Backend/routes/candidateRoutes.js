const express = require("express");
const {
  getCandidates,
  bulkImport,
  shortlistCandidate,
  rejectCandidate,
  deleteCandidate,
  importFromLink
} = require("../controllers/candidateController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// All routes require HR / super_admin
router.get   ("/candidates",                   auth, getCandidates);
router.post  ("/candidates/bulk-import",       auth, bulkImport);
router.post  ("/candidates/import-from-link",  auth, importFromLink);
router.post  ("/candidates/:id/shortlist",     auth, shortlistCandidate);
router.patch ("/candidates/:id/reject",        auth, rejectCandidate);
router.delete("/candidates/:id",               auth, deleteCandidate);

module.exports = router;
