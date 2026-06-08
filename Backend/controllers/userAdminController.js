const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User   = require("../models/user");
let sendEmail; try { sendEmail = require("../utils/sendEmail"); } catch (e) { sendEmail = async () => {}; }

const ROLES = ["super_admin","hr","sales","presales","postsales","marketing","lms","instructor","student","employee","payroll","leadgen"];
function adminOnly(req, res) {
  if (!req.user || !["super_admin","admin"].includes(req.user.role)) { res.status(403).json({ msg: "Admin only" }); return false; }
  return true;
}
function genPass() { return "Zx" + crypto.randomBytes(4).toString("hex") + "!" + Math.floor(10 + Math.random() * 89); }

exports.listUsers = async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    const q = {};
    if (req.query.role) q.role = req.query.role;
    if (req.query.search) {
      const rx = new RegExp(String(req.query.search).trim(), "i");
      q.$or = [{ name: rx }, { email: rx }];
    }
    const users = await User.find(q).select("name email role active createdAt").sort({ createdAt: -1 }).limit(500).lean();
    return res.json({ users, roles: ROLES });
  } catch (e) { console.error("listUsers:", e); return res.status(500).json({ msg: "Server error" }); }
};

exports.createUser = async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    const email = (req.body.email || "").toLowerCase().trim();
    const role  = req.body.role;
    if (!email || !email.includes("@")) return res.status(400).json({ msg: "Valid email required" });
    if (!ROLES.includes(role)) return res.status(400).json({ msg: "Invalid role" });
    let user = await User.findOne({ email });
    const provided = (req.body.password || "").trim();
    const pass = provided || genPass();
    const hash = await bcrypt.hash(pass, 10);
    if (user) {
      user.role = role; user.active = true; if (req.body.name) user.name = req.body.name;
      if (provided) user.password = hash;
      await user.save();
      return res.json({ user: { _id: user._id, name: user.name, email: user.email, role: user.role }, created: false });
    }
    user = await User.create({ name: req.body.name || email.split("@")[0], email, password: hash, role, active: true });
    let emailed = false;
    if (req.body.sendEmail !== false) {
      try { await sendEmail(email, "Your Zyntrix CRM Login", `Hello ${user.name},\n\nYour Zyntrix CRM account has been created.\n\nPortal : https://zyntrixsoftware.com/crm/index.html\nEmail  : ${email}\nPassword: ${pass}\nRole   : ${role}\n\n— Zyntrix CRM`); emailed = true; } catch (e) {}
    }
    return res.json({ user: { _id: user._id, name: user.name, email: user.email, role: user.role }, created: true, emailed, tempPassword: emailed ? null : pass });
  } catch (e) { console.error("createUser:", e); return res.status(500).json({ msg: "Server error" }); }
};

exports.updateUser = async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    const upd = {};
    if (req.body.name !== undefined) upd.name = req.body.name;
    if (req.body.role !== undefined) { if (!ROLES.includes(req.body.role)) return res.status(400).json({ msg: "Invalid role" }); upd.role = req.body.role; }
    if (req.body.active !== undefined) upd.active = !!req.body.active;
    const user = await User.findByIdAndUpdate(req.params.id, upd, { new: true }).select("name email role active");
    if (!user) return res.status(404).json({ msg: "Not found" });
    return res.json({ user });
  } catch (e) { console.error("updateUser:", e); return res.status(500).json({ msg: "Server error" }); }
};

exports.resetPassword = async (req, res) => {
  if (!adminOnly(req, res)) return;
  try {
    const user = await User.findById(req.params.id); if (!user) return res.status(404).json({ msg: "Not found" });
    const provided = (req.body.password || "").trim();
    const pass = provided || genPass();
    user.password = await bcrypt.hash(pass, 10); await user.save();
    let emailed = false;
    if (req.body.sendEmail !== false) {
      try { await sendEmail(user.email, "Your Zyntrix CRM password was reset", `Hello ${user.name},\n\nYour password has been reset by an administrator.\n\nEmail  : ${user.email}\nPassword: ${pass}\n\nPlease change it after logging in.\n\n— Zyntrix CRM`); emailed = true; } catch (e) {}
    }
    return res.json({ ok: true, emailed, tempPassword: emailed ? null : pass });
  } catch (e) { console.error("resetPassword:", e); return res.status(500).json({ msg: "Server error" }); }
};
