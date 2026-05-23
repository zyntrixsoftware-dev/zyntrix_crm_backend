/**
 * Seed the two dedicated payroll login accounts.
 *
 *   salespay@zyntrixsoftware.com
 *   hrpay@zyntrixsoftware.com
 *
 * Both are created with role "payroll" — these are the ONLY accounts that can
 * access the separate Payroll section (access is enforced by email, see
 * payrollController.js + auth.js PAYROLL_EMAILS).
 *
 * Usage (from the Backend folder):
 *   node seedPayrollAccounts.js                 # create if missing
 *   node seedPayrollAccounts.js --reset-password # also reset password to the temp one
 *
 * Temporary password: Payroll@2026  — change it after first login.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const User     = require("./models/user");

const TEMP_PASSWORD = process.env.PAYROLL_TEMP_PASSWORD || "Payroll@2026";

const ACCOUNTS = [
  { name: "Sales Payroll", email: "salespay@zyntrixsoftware.com" },
  { name: "HR Payroll",    email: "hrpay@zyntrixsoftware.com" }
];

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ MONGO_URI not found in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB");

  const resetPassword = process.argv.includes("--reset-password");
  const hash = await bcrypt.hash(TEMP_PASSWORD, 12);

  for (const acc of ACCOUNTS) {
    const email = acc.email.toLowerCase();
    const existing = await User.findOne({ email });

    if (existing) {
      existing.role   = "payroll";
      existing.active = true;
      if (resetPassword) existing.password = hash;
      await existing.save();
      console.log(`↻ Updated ${email} (role=payroll${resetPassword ? ", password reset" : ""})`);
    } else {
      await User.create({
        name:     acc.name,
        email,
        password: hash,
        role:     "payroll",
        active:   true
      });
      console.log(`＋ Created ${email}  (temp password: ${TEMP_PASSWORD})`);
    }
  }

  await mongoose.disconnect();
  console.log("✅ Done. Remember to change the temporary password after first login.");
})().catch(err => {
  console.error("❌ Seed error:", err.message);
  process.exit(1);
});
