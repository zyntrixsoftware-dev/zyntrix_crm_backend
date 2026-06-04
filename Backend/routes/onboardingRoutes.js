const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const {
  formWebhook,
  createOnboarding,
  syncFromSheet,
  manualImport,
  getOnboardings,
  getOnboarding,
  updateStatus,
  updateChecklistItem,
  verifyDocument,
  addNote,
  updateOnboarding,
  uploadOnboardingDocsMw,
  publicUploadDocs,
  downloadDoc
} = require("../controllers/onboardingController");

// ── Public webhook — called by Google Apps Script (no JWT) ───────────────────
// Protected by shared ONBOARDING_WEBHOOK_SECRET in the request body.
router.post("/onboarding/webhook", formWebhook);

// Public — candidate document upload (token in body) + protected download (token in header/query)
router.post("/onboarding/upload", uploadOnboardingDocsMw, publicUploadDocs);
router.get ("/onboarding/doc/:id/:docKey", downloadDoc);

// ── HR-authenticated routes ───────────────────────────────────────────────────
router.use(auth);

router.post  ("/onboarding",                              createOnboarding);
router.post  ("/onboarding/sync-sheet",                   syncFromSheet);
router.post  ("/onboarding/import",                       manualImport);
router.get   ("/onboarding",                              getOnboardings);
router.get   ("/onboarding/:id",                          getOnboarding);
router.patch ("/onboarding/:id",                          updateOnboarding);
router.patch ("/onboarding/:id/status",                   updateStatus);
router.patch ("/onboarding/:id/checklist/:itemId",        updateChecklistItem);
router.patch ("/onboarding/:id/documents/:docKey/verify", verifyDocument);
router.post  ("/onboarding/:id/notes",                    addNote);

module.exports = router;
