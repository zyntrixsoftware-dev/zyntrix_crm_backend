const express = require("express");
const {
  // Interview Panel
  getInterviews,
  getPassedCandidates,
  createInterview,
  updateRound,
  updateInterviewStatus,

  // Offer Letter Panel
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
router.get("/interviews",                    auth, getInterviews);
router.get("/interviews/passed",             auth, getPassedCandidates);   // ← passed candidates
router.post("/interviews",                   auth, createInterview);
router.patch("/interviews/:id/round",        auth, updateRound);
router.patch("/interviews/:id/status",       auth, updateInterviewStatus);

// ── OFFER LETTER PANEL ────────────────────────────────────────────
router.get("/offers",                        auth, getOffers);
router.get("/offers/:id",                    auth, getOffer);
router.post("/offers",                       auth, createOffer);            // auto-generates letter body
router.put("/offers/:id",                    auth, updateOffer);
router.post("/offers/:id/send",              auth, sendOffer);              // sends via hr@zyntrixsoftware.com
router.patch("/offers/:id/status",           auth, updateOfferStatus);

module.exports = router;
