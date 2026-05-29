/**
 * LeadGen User Seed Script
 * Run once on the server to create the lead@zyntrixsoftware.com account.
 *
 * Usage:
 *   node seed-leadgen.js
 *
 * On Render: go to your service → Shell tab → paste and run
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error("❌  MONGO_URI not set in .env"); process.exit(1); }

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("✅  MongoDB connected");

  // Use the existing User model definition
  const User = require("./models/user");

  const EMAIL    = "lead@zyntrixsoftware.com";
  const PASSWORD = "Leadgen@2026";
  const HASH     = await bcrypt.hash(PASSWORD, 10);

  const doc = await User.findOneAndUpdate(
    { email: EMAIL },
    { $set: { name: "LeadGen Team", email: EMAIL, password: HASH, role: "leadgen", isActive: true } },
    { upsert: true, new: true }
  );

  console.log("✅  User ready:");
  console.log("    _id   :", doc._id.toString());
  console.log("    email :", doc.email);
  console.log("    role  :", doc.role);
  console.log("");
  console.log("╔══════════════════════════════════════╗");
  console.log("║  LOGIN CREDENTIALS                   ║");
  console.log("║  Email   : lead@zyntrixsoftware.com  ║");
  console.log("║  Password: Leadgen@2026              ║");
  console.log("╚══════════════════════════════════════╝");

  await mongoose.disconnect();
}

run().catch(e => { console.error("❌ ", e.message); process.exit(1); });
