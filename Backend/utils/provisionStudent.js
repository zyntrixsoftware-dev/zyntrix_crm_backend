// Shared student-account provisioning: create a `student` login from an email,
// generate a temp password, and email the credentials via the Graph sender.
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User   = require("../models/user");
let sendEmail; try { sendEmail = require("./sendEmail"); } catch (e) { sendEmail = async () => {}; }

function genPass() { return "Zx" + crypto.randomBytes(4).toString("hex") + "!" + Math.floor(10 + Math.random() * 89); }

// Ensure a student account exists for `email`. Returns {email,name,created,tempPassword}.
async function ensureStudent(email, name) {
  email = String(email || "").toLowerCase().trim();
  if (!email || !email.includes("@")) return { email, created: false, error: "invalid email" };
  let user = await User.findOne({ email });
  if (user) {
    if (!["super_admin", "lms", "instructor"].includes(user.role)) user.role = "student";
    user.active = true; await user.save();
    return { email, name: user.name, created: false, tempPassword: null };
  }
  const tempPassword = genPass();
  const hash = await bcrypt.hash(tempPassword, 10);
  user = await User.create({ name: name || email.split("@")[0], email, password: hash, role: "student", active: true });
  return { email, name: user.name, created: true, tempPassword };
}

async function emailStudentCreds(email, name, tempPassword) {
  if (!tempPassword) return false;
  const url = "https://zyntrixsoftware.com/crm/index.html";
  const text = `Hello ${name || "Student"},\n\nYour Zyntrix learning account is ready.\n\nPortal : ${url}\nEmail  : ${email}\nPassword: ${tempPassword}\n\nLog in to access your courses. You can change your password anytime via "Forgot password".\n\n— Zyntrix LMS`;
  try { await sendEmail(email, "Your Zyntrix LMS Login", text); return true; } catch (e) { console.warn("student cred email failed", email, e.message); return false; }
}

module.exports = { ensureStudent, emailStudentCreds };
