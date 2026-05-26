const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const {
  list, getOne, create, update, sendInvite, updateChecklist,
  listSessions, createSession, updateSession, deleteSession
} = require("../controllers/orientationController");

router.use(auth);

// ── Orientation records (per candidate) ──────────────────────────
router.get   ("/orientation",                              list);
router.post  ("/orientation",                              create);
router.get   ("/orientation/:id",                          getOne);
router.patch ("/orientation/:id",                          update);
router.post  ("/orientation/:id/send-invite",              sendInvite);
router.patch ("/orientation/:id/checklist/:itemId",        updateChecklist);

// ── Orientation sessions (schedule / agenda) ─────────────────────
router.get   ("/orientation/sessions/all",                 listSessions);
router.post  ("/orientation/sessions",                     createSession);
router.patch ("/orientation/sessions/:id",                 updateSession);
router.delete("/orientation/sessions/:id",                 deleteSession);

module.exports = router;
