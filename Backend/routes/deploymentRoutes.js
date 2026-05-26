const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const {
  listReady, list, getOne, deploy, update, remove,
  listTeams, createTeam, updateTeam, deleteTeam, teamMembers
} = require("../controllers/deploymentController");

router.use(auth);

// ── Ready-to-deploy queue (orientation completed, not yet deployed) ──
router.get("/deployment/ready", listReady);

// ── Teams — MUST come before /:id routes ────────────────────────────
router.get   ("/deployment/teams",              listTeams);
router.post  ("/deployment/teams",              createTeam);
router.patch ("/deployment/teams/:tid",         updateTeam);
router.delete("/deployment/teams/:tid",         deleteTeam);
router.get   ("/deployment/teams/:tid/members", teamMembers);

// ── Deployment records ───────────────────────────────────────────────
router.get   ("/deployment",      list);
router.post  ("/deployment",      deploy);
router.get   ("/deployment/:id",  getOne);
router.patch ("/deployment/:id",  update);
router.delete("/deployment/:id",  remove);

module.exports = router;
