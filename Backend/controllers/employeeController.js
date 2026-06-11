const User   = require("../models/user");
const hrNotify = require("../utils/hrNotify");
const bcrypt = require("bcryptjs");
const gridfs = require("../utils/gridfs");

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
//
// Profile photos are stored as binary blobs in MongoDB's GridFS (bucket
// "employee_files") — see Backend/utils/gridfs.js. The User document only
// holds a pointer (photoFileId) plus the MIME type. Photos are served via
// GET /api/employee/photo/:userId so any <img> tag can simply use that URL.
// ─────────────────────────────────────────────────────────────────────────────

// Build an absolute URL the frontend can drop into <img src="…">.
// We return an absolute URL so it works even when the frontend and the API
// live on different origins (localhost:5500 vs localhost:5000 in dev, and
// frontend.com vs api.backend.com in prod).
function apiHostFromReq(req) {
  if (!req) return "";
  const proto = (req.headers && req.headers["x-forwarded-proto"]) || req.protocol || "http";
  const host  = req.get ? req.get("host") : (req.headers && req.headers.host);
  return host ? `${proto}://${host}` : "";
}

function buildPhotoUrl(u, host = "") {
  if (u.photoFileId) {
    const path = `/api/employee/photo/${u._id}?v=${String(u.photoFileId).slice(-6)}`;
    return host ? host + path : path;
  }
  if (u.photo) return u.photo;   // legacy inline data URL — self-contained
  return "";
}

// Build the shape the Profile page (Frontend/modules/profile.html) expects.
function shapeProfile(u, host = "") {
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
    photo:          buildPhotoUrl(u, host),
    photoUrl:       buildPhotoUrl(u, host),
    hasPhoto:       !!(u.photoFileId || u.photo),
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

    return res.json({ profile: shapeProfile(user, apiHostFromReq(req)) });
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

    const simple = ["name", "phone", "dob", "gender", "address", "city", "state", "bio"];
    simple.forEach(f => {
      if (b[f] !== undefined && b[f] !== null) user[f] = String(b[f]).slice(0, 2000);
    });

    if (typeof b.name === "string" && !b.name.trim()) {
      return res.status(400).json({ msg: "Name cannot be empty" });
    }

    // NOTE: photo uploads go through POST /api/employee/photo (GridFS).
    // We still accept photo: "" here as a "clear my photo" signal for older
    // clients, and keep the legacy data-URL path for backwards compatibility.
    if (b.photo !== undefined) {
      const photo = String(b.photo || "");
      if (photo === "") {
        if (user.photoFileId) {
          try { await gridfs.deleteFile(user.photoFileId); } catch (_) {}
        }
        user.photoFileId = null;
        user.photoMime   = "";
        user.photo       = "";
      } else if (/^data:image\/(png|jpe?g|webp|gif);base64,/.test(photo)) {
        if (photo.length > 2_500_000) {
          return res.status(400).json({ msg: "Photo is too large — please use a smaller image" });
        }
        user.photo = photo;
      } else {
        return res.status(400).json({ msg: "Photo must be a valid image (use the upload endpoint)" });
      }
    }

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

    (function () {
      const who = user.name || user.email || "An employee";
      hrNotify.notifyHr("Profile updated — " + who, "Employee profile updated",
        who + " updated their profile in the Employee portal.",
        [["Employee", who], ["Email", user.email || "—"]]);
    })();

    return res.json({ msg: "Profile saved", profile: shapeProfile(fresh, apiHostFromReq(req)) });
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

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE PHOTO (GridFS-backed)
// ─────────────────────────────────────────────────────────────────────────────

exports.buildPhotoUrl  = buildPhotoUrl;
exports.apiHostFromReq = apiHostFromReq;

// POST /api/employee/photo
// multipart/form-data with a single field "photo".
// Stores the file in GridFS, points the user document at it, and returns the
// new public URL the frontend can use immediately.
exports.uploadMyPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: "No file uploaded" });

    const { mimetype, buffer, originalname, size } = req.file;

    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(mimetype)) {
      return res.status(400).json({ msg: "Only PNG, JPG, WebP or GIF images are allowed" });
    }
    if (size > 8 * 1024 * 1024) {
      return res.status(400).json({ msg: "Image must be under 8 MB" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "Profile not found" });

    if (user.photoFileId) {
      try { await gridfs.deleteFile(user.photoFileId); } catch (_) {}
    }

    const fileId = await gridfs.uploadBuffer(
      buffer,
      originalname || `profile-${user._id}.jpg`,
      mimetype,
      { userId: String(user._id), kind: "profile-photo" }
    );

    user.photoFileId = fileId;
    user.photoMime   = mimetype;
    user.photo       = "";
    await user.save();

    return res.json({
      msg:      "Photo uploaded",
      photoUrl: buildPhotoUrl(user, apiHostFromReq(req))
    });
  } catch (err) {
    console.error("UPLOAD MY PHOTO ERROR:", err);
    return res.status(500).json({ msg: "Could not upload photo" });
  }
};

// GET /api/employee/photo/:userId — streams the bytes from GridFS.
exports.servePhoto = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("photoFileId photo photoMime");
    if (!user) return res.status(404).end();

    // Legacy inline data URL — peel apart and serve as binary
    if (!user.photoFileId && user.photo && /^data:image\//.test(user.photo)) {
      const m = user.photo.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (!m) return res.status(404).end();
      res.setHeader("Content-Type", m[1]);
      res.setHeader("Cache-Control", "private, max-age=60");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      return res.end(Buffer.from(m[2], "base64"));
    }

    if (!user.photoFileId) return res.status(404).end();

    const file = await gridfs.findFile(user.photoFileId);
    if (!file) return res.status(404).end();

    res.setHeader("Content-Type", file.contentType || user.photoMime || "image/jpeg");
    res.setHeader("Content-Length", file.length);
    res.setHeader("Cache-Control", "private, max-age=60");
    // <img src="…"> on a different origin (e.g. zyntrixsoftware.com loading from
    // *.onrender.com) is blocked by helmet's default CORP same-origin policy.
    // Photos are non-sensitive employee avatars — opt them into cross-origin.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    const stream = gridfs.openDownloadStream(user.photoFileId);
    stream.on("error", () => { if (!res.headersSent) res.status(404).end(); });
    stream.pipe(res);
  } catch (err) {
    console.error("SERVE PHOTO ERROR:", err);
    if (!res.headersSent) res.status(500).end();
  }
};

// DELETE /api/employee/photo
exports.deleteMyPhoto = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "Profile not found" });

    if (user.photoFileId) {
      try { await gridfs.deleteFile(user.photoFileId); } catch (_) {}
    }
    user.photoFileId = null;
    user.photoMime   = "";
    user.photo       = "";
    await user.save();

    return res.json({ msg: "Photo removed" });
  } catch (err) {
    console.error("DELETE MY PHOTO ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── POST /api/auth/revoke-sessions ───────────────────────────────────────────
// JWTs are stateless, so there is nothing server-side to expire. We
// acknowledge the request; the client clears its token and logs out.
exports.revokeSessions = async (req, res) => {
  return res.json({ msg: "All sessions revoked. Please log in again." });
};

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE APP SETTINGS  (notifications / appearance / attendance prefs /
// privacy / language / integrations). Stored as a free-form object on the user.
// ─────────────────────────────────────────────────────────────────────────────

// Recursively merge `patch` into `base` (objects merge, scalars/arrays replace).
function deepMerge(base, patch) {
  const out = (base && typeof base === "object" && !Array.isArray(base)) ? { ...base } : {};
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) &&
        out[k] && typeof out[k] === "object" && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── GET /api/employee/settings ───────────────────────────────────────────────
exports.getMySettings = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("settings");
    if (!user) return res.status(404).json({ msg: "User not found" });
    return res.json({ settings: user.settings || {} });
  } catch (err) {
    console.error("GET MY SETTINGS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── PUT /api/employee/settings ───────────────────────────────────────────────
// Body is a partial settings patch (e.g. { appearance: {...} }). We deep-merge
// it into the stored settings so each section can be saved independently.
exports.updateMySettings = async (req, res) => {
  try {
    const patch = req.body || {};
    if (typeof patch !== "object" || Array.isArray(patch)) {
      return res.status(400).json({ msg: "Settings payload must be an object" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    user.settings = deepMerge(user.settings || {}, patch);
    user.markModified("settings");   // required for Mixed-type fields
    await user.save();

    return res.json({ msg: "Settings saved", settings: user.settings });
  } catch (err) {
    console.error("UPDATE MY SETTINGS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── POST /api/employee/deactivate ────────────────────────────────────────────
// Self-service account deactivation (Settings → Danger Zone). Login is blocked
// while `active` is false; HR can flip it back on.
exports.deactivateAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    user.active = false;
    if (user.employeeStatus && user.employeeStatus !== "Terminated") {
      user.employeeStatus = "On Leave";
    }
    await user.save();

    (function () {
      const who = user.name || user.email || "An employee";
      hrNotify.notifyHr("Account deactivated — " + who, "Employee self-deactivated their account",
        "<b>" + who + "</b> deactivated their own account from Settings. They will need HR to reactivate it.",
        [["Employee", who], ["Email", user.email || "—"], ["Status", user.employeeStatus || "—"]]);
    })();

    return res.json({ msg: "Account deactivated. Contact HR to reactivate." });
  } catch (err) {
    console.error("DEACTIVATE ACCOUNT ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── POST /api/employee/data-export ───────────────────────────────────────────
// Compiles a copy of the employee's own data (profile, settings, attendance,
// leave/shift requests) and returns it so the client can download it.
exports.requestDataExport = async (req, res) => {
  try {
    const Attendance      = require("../models/attendance");
    const EmployeeRequest = require("../models/EmployeeRequest");

    const user = await User.findById(req.user.id)
      .select("-password -otpCode -otpExpiry -otpResetToken -otpVerified")
      .lean();
    if (!user) return res.status(404).json({ msg: "User not found" });

    const [attendance, requests] = await Promise.all([
      Attendance.find({ userId: req.user.id }).sort({ date: -1 }).lean(),
      EmployeeRequest.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean()
    ]);

    return res.json({
      msg: "Data export ready",
      export: {
        exportedAt: new Date().toISOString(),
        profile:    user,
        settings:   user.settings || {},
        attendance,
        requests
      }
    });
  } catch (err) {
    console.error("DATA EXPORT ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};
