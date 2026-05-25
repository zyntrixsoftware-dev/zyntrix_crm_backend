const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const {
  formWebhook,
  createOnboarding,
  getOnboardings,
  getOnboarding,
  updateStatus,
  updateChecklistItem,
  verifyDocument,
  addNote,
  updateOnboarding
} = require("../controllers/onboardingController");

// ── Public webhook — called by Google Apps Script (no JWT) ───────────────────
// Protected by shared ONBOARDING_WEBHOOK_SECRET in the request body.
router.post("/onboarding/webhook", formWebhook);

// ── HR-authenticated routes ───────────────────────────────────────────────────
router.use(auth);

router.post  ("/onboarding",                              createOnboarding);
router.get   ("/onboarding",                              getOnboardings);
router.get   ("/onboarding/:id",                          getOnboarding);
router.patch ("/onboarding/:id",                          updateOnboarding);
router.patch ("/onboarding/:id/status",                   updateStatus);
router.patch ("/onboarding/:id/checklist/:itemId",        updateChecklistItem);
router.patch ("/onboarding/:id/documents/:docKey/verify", verifyDocument);
router.post  ("/onboarding/:id/notes",                    addNote);

module.exports = router;
