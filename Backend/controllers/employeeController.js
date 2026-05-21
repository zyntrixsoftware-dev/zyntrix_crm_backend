const User   = require("../models/user");
const bcrypt = require("bcryptjs");

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE SELF-SERVICE PROFILE
//
// These endpoints let a logged-in employee view and edit *their own* profile.
// They write to the same User collection the HRMS "Employees" section reads
// from, so any change an employee makes here shows up for HR automatically.
//
// Employees can only edit personal fields (name, contact, photo, etc.).
// Job/comp fields (salary, department, designation, role, status) remain
// HR-controlled and are returned read-only.
// ─────────────────────────────────────────────────────────────────────────────

// Build the shape the Profile page (Frontend/modules/profile.html) expects.
function shapeProfile(u) {
  return {
    _id:            u._id,
    name:           u.name,
    email:          u.email,
    role:           u.role,

    // personal (editable)
    phone:          u.phone || "",
    dob:            u.dob || "",
    gender:         u.gender || "",
    address:        u.address || "",
    city:           u.city || "",
    state:          u.state || "",
    bio:            u.bio || "",
    photo:          u.photo || "",
    emergencyContact: {
      name:     u.emergencyDetails?.name     || "",
      relation: u.emergencyDetails?.relation || "",
      phone:    u.emergencyDetails?.phone    || "",
      altPhone: u.emergencyDetails?.altPhone || ""
    },

    // work info (read-only on the profile page)
    department:     u.department || "",
    designation:    u.designation || "",
    joiningDate:    u.dateOfJoining || "",
    employmentType: u.employeeType || "Full-time",
    workLocation:   u.workLocation || "On-site",
    employeeStatus: u.employeeStatus || "Active",
    reportingTo:    u.reportingTo
      ? (u.reportingTo.name || "")
      : ""
  };
}

// ── GET /api/employee/profile ────────────────────────────────────────────────
exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password -otpCode -otpExpiry -otpResetToken")
      .populate("reportingTo", "name designation");

    if (!user) return res.status(404).json({ msg: "Profile not found" });

    return res.json({ profile: shapeProfile(user) });
  } catch (err) {
    console.error("GET MY PROFILE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── PUT /api/employee/profile ────────────────────────────────────────────────
// Accepts any subset of the editable personal fields.
exports.updateMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "Profile not found" });

    const b = req.body || {};

    // Simple string fields the employee owns
    const simple = ["name", "phone", "dob", "gender", "address", "city", "state", "bio"];
    simple.forEach(f => {
      if (b[f] !== undefined && b[f] !== null) user[f] = String(b[f]).slice(0, 2000);
    });

    if (typeof b.name === "string" && !b.name.trim()) {
      return res.status(400).json({ msg: "Name cannot be empty" });
    }

    // Photo (data URL) — keep payloads sane. ~1.4 MB of base64 ≈ 1 MB image.
    if (b.photo !== undefined) {
      const photo = String(b.photo || "");
      if (photo && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(photo)) {
        return res.status(400).json({ msg: "Photo must be a valid image" });
      }
      if (photo.length > 2_500_000) {
        return res.status(400).json({ msg: "Photo is too large — please use a smaller image" });
      }
      user.photo = photo;
    }

    // Emergency contact (object). We store the structured version AND keep the
    // legacy string field in sync so the HR employee list still shows it.
    if (b.emergencyContact && typeof b.emergencyContact === "object") {
      const ec = b.emergencyContact;
      user.emergencyDetails = {
        name:     String(ec.name     || "").slice(0, 200),
        relation: String(ec.relation || "").slice(0, 100),
        phone:    String(ec.phone    || "").slice(0, 50),
        altPhone: String(ec.altPhone || "").slice(0, 50)
      };
      const summary = [user.emergencyDetails.name, user.emergencyDetails.phone]
        .filter(Boolean).join(" · ");
      if (summary) user.emergencyContact = summary;
    }

    await user.save();

    const fresh = await User.findById(user._id)
      .select("-password -otpCode -otpExpiry -otpResetToken")
      .populate("reportingTo", "name designation");

    return res.json({ msg: "Profile saved", profile: shapeProfile(fresh) });
  } catch (err) {
    console.error("UPDATE MY PROFILE ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── POST /api/auth/change-password ───────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ msg: "Current and new password are required" });
    }
    if (newPassword.length < 8 || !/\d/.test(newPassword)) {
      return res.status(400).json({
        msg: "New password must be at least 8 characters and include a number"
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ msg: "Current password is incorrect" });

    const same = await bcrypt.compare(newPassword, user.password);
    if (same) return res.status(400).json({ msg: "New password must be different from the current one" });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    return res.json({ msg: "Password updated successfully" });
  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── POST /api/auth/revoke-sessions ───────────────────────────────────────────
// JWTs are stateless, so there is nothing server-side to expire. We
// acknowledge the request; the client clears its token and logs out.
exports.revokeSessions = async (req, res) => {
  return res.json({ msg: "All sessions revoked. Please log in again." });
};
