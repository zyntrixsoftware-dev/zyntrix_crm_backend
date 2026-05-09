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

    if (!email) {
      return res.status(400).json({ msg: "Email is required" });
    }

    // Domain restriction
    const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || "";
    if (allowedDomain && !email.endsWith("@" + allowedDomain)) {
      return res.status(400).json({ msg: `Use your @${allowedDomain} company email` });
    }

    const user = await User.findOne({ email });

    // Always return success — prevents user enumeration
    if (!user) {
      return res.json({ msg: "If that email is registered, an OTP has been sent." });
    }

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
    } catch (emailErr) {
      console.error("OTP EMAIL FAILED:", emailErr.message);
      return res.status(500).json({ msg: "Could not send OTP email. Please contact admin." });
    }

    return res.json({ msg: "If that email is registered, an OTP has been sent." });

  } catch (err) {
    console.error("SEND OTP ERROR:", err);
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
