const express = require("express");
const {
	login,
	sendOtp,
	verifyOtp,
	resetPassword,
	forgotPassword
} = require("../controllers/authController");

const router = express.Router();

router.post("/login",           login);
router.post("/send-otp",        sendOtp);
router.post("/verify-otp",      verifyOtp);
router.post("/reset-password",  resetPassword);

// Legacy route — same as send-otp
router.post("/forgot-password", forgotPassword);

module.exports = router;
