const express = require("express");
const {
  // Interview Panel
  getInterviews,
  getPassedCandidates,
  createInterview,
  updateRound,
  updateInterviewStatus,
  updateInterviewNote,
  toggleOffered,

  // Offer Letter Panel
  getOfferTemplates,
  previewOffer,
  getOffers,
  getOffer,
  createOffer,
  updateOffer,
  sendOffer,
  updateOfferStatus
} = require("../controllers/interviewOfferController");

const auth = require("../middleware/authMiddleware");

const router = express.Router();

// ── INTERVIEW PANEL ───────────────────────────────────────────────
router.get   ("/interviews",                    auth, getInterviews);
router.get   ("/interviews/passed",             auth, getPassedCandidates);
router.post  ("/interviews",                    auth, createInterview);
router.patch ("/interviews/:id/round",          auth, updateRound);
router.patch ("/interviews/:id/status",         auth, updateInterviewStatus);
router.patch ("/interviews/:id/note",           auth, updateInterviewNote);
router.patch ("/interviews/:id/offered",        auth, toggleOffered);

// ── OFFER LETTER PANEL ────────────────────────────────────────────
// IMPORTANT: /offers/templates and /offers/preview MUST come before /offers/:id
router.get   ("/offers/templates",              auth, getOfferTemplates);
router.post  ("/offers/preview",                auth, previewOffer);
router.get   ("/offers",                        auth, getOffers);
router.get   ("/offers/:id",                    auth, getOffer);
router.post  ("/offers",                        auth, createOffer);
router.put   ("/offers/:id",                    auth, updateOffer);
router.post  ("/offers/:id/send",               auth, sendOffer);
router.patch ("/offers/:id/status",             auth, updateOfferStatus);

module.exports = router;
