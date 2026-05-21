const User      = require("../models/user");
const jwt       = require("jsonwebtoken");
const bcrypt    = require("bcryptjs");
const crypto    = require("crypto");
const sendEmail = require("../utils/sendEmail");

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashValue(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function isStrongPassword(password) {
  return password.length >= 8 && /\d/.test(password);
}

function generateOTP() {
  // 6-digit numeric OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const rawEmail = req.body?.email || "";
    const email    = rawEmail.trim().toLowerCase();
    const password = req.body?.password || "";

    if (!email || !password) {
      return res.status(400).json({ msg: "Email and password required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ msg: "Invalid email or password" });
    }

    if (!user.password) {
      return res.status(500).json({ msg: "Account not properly set up — contact admin" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid email or password" });
    }

    // Blocked while the employee has self-deactivated their account.
    if (user.active === false) {
      return res.status(403).json({ msg: "Your account is deactivated. Please contact HR to reactivate it." });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ msg: "Server configuration error" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({
      token,
      user: {
        _id:       user._id,
        name:      user.name,
        email:     user.email,
        role:      user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── STEP 1: SEND OTP ──────────────────────────────────────────────────────────
exports.sendOtp = async (req, res) => {
  try {
    const rawEmail = req.body?.email || "";
    const email    = rawEmail.trim().toLowerCase();

    console.log("[sendOtp] request for:", email);

    if (!email) {
      return res.status(400).json({ msg: "Email is required" });
    }

    // Domain restriction (env-driven). If ALLOWED_EMAIL_DOMAIN is set on
    // Railway it can silently block legit reset attempts — log it so the
    // Railway logs reveal that misconfiguration immediately.
    const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || "";
    if (allowedDomain && !email.endsWith("@" + allowedDomain)) {
      console.warn(
        "[sendOtp] BLOCKED by ALLOWED_EMAIL_DOMAIN=" + allowedDomain +
        " — incoming email did not match. Unset this env var if you want to allow any domain."
      );
      return res.status(400).json({ msg: `Use your @${allowedDomain} company email` });
    }

    // Loud warning if DEV_SKIP_EMAIL is on in prod — most common reason
    // OTP "doesn't arrive": the email is just being printed to console.
    if (process.env.DEV_SKIP_EMAIL === "true") {
      console.warn(
        "[sendOtp] DEV_SKIP_EMAIL=true is active — OTP will be PRINTED to logs " +
        "instead of being emailed. Set DEV_SKIP_EMAIL=false (or unset it) on Railway " +
        "to deliver real OTPs."
      );
    }

    const user = await User.findOne({ email });

    // Always return success — prevents user enumeration. Log so we know
    // whether the email matched a user account or not.
    if (!user) {
      console.warn("[sendOtp] no user found for", email,
        "— returning generic success to avoid leaking user existence.");
      return res.json({ msg: "If that email is registered, an OTP has been sent." });
    }

    console.log("[sendOtp] user found:", user._id.toString(), "name:", user.name);

    // Generate OTP
    const otp       = generateOTP();
    const otpHashed = hashValue(otp);

    user.otpCode       = otpHashed;
    user.otpExpiry     = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.otpVerified   = false;
    user.otpResetToken = undefined;
    await user.save();

    // Send email
    try {
      await sendEmail(
        email,
        "Zyntrix CRM — Your Password Reset OTP",
        `Hello ${user.name},\n\nYour OTP to reset your password is:\n\n  ${otp}\n\nThis OTP is valid for 10 minutes. Do not share it with anyone.\n\nIf you did not request this, please ignore this email.\n\n— Zyntrix CRM Team`
      );
      console.log("[sendOtp] OTP email dispatched OK to", email);
    } catch (emailErr) {
      console.error("[sendOtp] OTP EMAIL FAILED to", email);
      console.error("  message :", emailErr.message);
      console.error("  code    :", emailErr.code);
      console.error("  response:", emailErr.response);
      console.error("  command :", emailErr.command);
      // In development we surface the real error so the dev can fix it fast.
      // In production we hide the details but the full stack is in Railway logs.
      const isProd = process.env.NODE_ENV === "production";
      return res.status(500).json({
        msg: isProd
          ? "Could not send OTP email. Please contact admin."
          : "Could not send OTP email: " + emailErr.message
      });
    }

    return res.json({ msg: "If that email is registered, an OTP has been sent." });

  } catch (err) {
    console.error("[sendOtp] UNEXPECTED ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── STEP 2: VERIFY OTP ────────────────────────────────────────────────────────
exports.verifyOtp = async (req, res) => {
  try {
    const rawEmail = req.body?.email || "";
    const email    = rawEmail.trim().toLowerCase();
    const otp      = (req.body?.otp || "").trim();

    if (!email || !otp) {
      return res.status(400).json({ msg: "Email and OTP are required" });
    }

    const user = await User.findOne({ email });

    if (!user || !user.otpCode || !user.otpExpiry) {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    // Check expiry
    if (user.otpExpiry < new Date()) {
      return res.status(400).json({ msg: "OTP has expired. Please request a new one." });
    }

    // Check OTP match
    if (hashValue(otp) !== user.otpCode) {
      return res.status(400).json({ msg: "Incorrect OTP. Please try again." });
    }

    // OTP is correct — issue a short-lived reset token
    const resetToken     = crypto.randomBytes(32).toString("hex");
    user.otpVerified     = true;
    user.otpResetToken   = hashValue(resetToken);
    user.otpCode         = undefined;
    user.otpExpiry       = undefined;
    await user.save();

    return res.json({
      msg:        "OTP verified successfully.",
      resetToken: resetToken   // raw token sent to frontend
    });

  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── STEP 3: RESET PASSWORD ────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken) {
      return res.status(400).json({ msg: "Reset token is required" });
    }

    if (!newPassword || !isStrongPassword(newPassword)) {
      return res.status(400).json({
        msg: "Password must be at least 8 characters and include at least one number"
      });
    }

    const user = await User.findOne({
      otpVerified:   true,
      otpResetToken: hashValue(resetToken)
    });

    if (!user) {
      return res.status(400).json({ msg: "Invalid or expired reset session. Please start again." });
    }

    // Update password
    const salt         = await bcrypt.genSalt(10);
    user.password      = await bcrypt.hash(newPassword, salt);
    user.otpVerified   = false;
    user.otpResetToken = undefined;
    await user.save();

    return res.json({ msg: "Password reset successful! You can now log in." });

  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── LEGACY: keep old forgotPassword route working (redirects to sendOtp logic)
exports.forgotPassword = exports.sendOtp;

// ─────────────────────────────────────────────────────────────────────────────
// SMTP TEST — GET /api/auth/_smtp-check?to=<email>
// HR / super_admin only. Sends a small test message through the SAME sendEmail
// pipeline candidate notifications use, and returns the result (success or
// nodemailer error code) as JSON so we don't have to scrape Railway logs.
//
// Usage:
//   curl -H "Authorization: Bearer <token>" \
//     "https://<host>/api/auth/_smtp-check?to=you@gmail.com"
// ─────────────────────────────────────────────────────────────────────────────
exports.smtpCheck = async (req, res) => {
  try {
    if (!req.user || !["hr", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ msg: "Access denied — hr/super_admin only" });
    }

    const to = (req.query.to || req.body?.to || "").trim();
    if (!to || !to.includes("@")) {
      return res.status(400).json({ msg: 'Provide a valid recipient as ?to=<email>' });
    }

    const env = {
      EMAIL_USER:        process.env.EMAIL_USER     || "(unset)",
      EMAIL_FROM:        process.env.EMAIL_FROM     || "(unset)",
      EMAIL_HOST:        process.env.EMAIL_HOST     || "(unset)",
      EMAIL_PORT:        process.env.EMAIL_PORT     || "(unset)",
      EMAIL_PASS:        process.env.EMAIL_PASS     ? "(set, " + process.env.EMAIL_PASS.length + " chars)" : "(unset)",
      DEV_SKIP_EMAIL:    process.env.DEV_SKIP_EMAIL || "(unset)",
      ALLOWED_EMAIL_DOMAIN: process.env.ALLOWED_EMAIL_DOMAIN || "(unset)",
      EMAIL_FROM_matches_EMAIL_USER:
        (process.env.EMAIL_FROM || process.env.EMAIL_USER) === process.env.EMAIL_USER
    };

    try {
      await sendEmail(
        to,
        "Zyntrix HRMS - SMTP test",
        "This is a diagnostic test message from Zyntrix HRMS to verify outbound email delivery. " +
        "If you received this, SMTP is configured correctly for this recipient."
      );
      return res.json({ ok: true, msg: "SMTP test send OK", to, env });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        msg: "SMTP test FAILED — see fields below for the exact reason",
        to,
        env,
        smtpError: {
          name:     err.name,
          message:  err.message,
          code:     err.code,
          response: err.response,
          responseCode: err.responseCode,
          command:  err.command
        }
      });
    }
  } catch (err) {
    console.error("[smtpCheck] unexpected:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};
