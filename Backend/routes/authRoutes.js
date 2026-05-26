const express = require("express");
const {
	login,
	sendOtp,
	verifyOtp,
	resetPassword,
	forgotPassword,
	smtpCheck,
	gasCheck
} = require("../controllers/authController");
const { changePassword, revokeSessions } = require("../controllers/employeeController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/login",           login);
router.post("/send-otp",        sendOtp);
router.post("/verify-otp",      verifyOtp);
router.post("/reset-password",  resetPassword);

// Logged-in user account actions
router.post("/change-password", auth, changePassword);
router.post("/revoke-sessions", auth, revokeSessions);

// Legacy route — same as send-otp
router.post("/forgot-password", forgotPassword);

// ── Diagnostics (HR / super_admin only) ──────────────────────────────────────
// GET  /api/auth/_smtp-check?to=<email>  — verifies outbound SMTP delivery
router.get ("/_smtp-check", auth, smtpCheck);
router.post("/_smtp-check", auth, smtpCheck);
router.get ("/_gas-check",  auth, gasCheck);
router.post("/_gas-check",  auth, gasCheck);

module.exports = router;
