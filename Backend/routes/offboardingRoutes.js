const express = require("express");
const {
  listOffboardings,
  createOffboarding,
  getOffboarding,
  updateOffboarding,
  updateChecklistItem,
  completeOffboarding,
  cancelOffboarding,
  deleteOffboarding
} = require("../controllers/offboardingController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// All routes require HR / super_admin (enforced in the controller).
router.get   ("/offboardings",                       auth, listOffboardings);
router.post  ("/offboardings",                       auth, createOffboarding);
router.get   ("/offboardings/:id",                   auth, getOffboarding);
router.patch ("/offboardings/:id",                   auth, updateOffboarding);
router.patch ("/offboardings/:id/checklist/:itemId", auth, updateChecklistItem);
router.post  ("/offboardings/:id/complete",          auth, completeOffboarding);
router.post  ("/offboardings/:id/cancel",            auth, cancelOffboarding);
router.delete("/offboardings/:id",                   auth, deleteOffboarding);

module.exports = router;
