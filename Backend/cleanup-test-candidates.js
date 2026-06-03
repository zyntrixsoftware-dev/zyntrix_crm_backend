// ─────────────────────────────────────────────────────────────────────────────
// Cleanup test candidates — removes ALL HRMS records tied to the given emails
// across every collection, so you can re-test the lifecycle from scratch.
//
//   node cleanup-test-candidates.js
//
// Add --dry to preview counts WITHOUT deleting:
//   node cleanup-test-candidates.js --dry
// ─────────────────────────────────────────────────────────────────────────────
require("dotenv").config();
const mongoose = require("mongoose");

// >>> The emails to purge. Edit this list if needed. <<<
const EMAILS = [
  "kolasanidinesh875@gmail.com",
  "kolasanidinesh25@gmail.com",
  "dinesh.kolasani@zyntrixsoftware.com",
];

const DRY = process.argv.includes("--dry");

const Candidate          = require("./models/Candidate");
const Interview          = require("./models/Interview");
const OfferLetter        = require("./models/OfferLetter");
const Onboarding         = require("./models/Onboarding");
const Orientation        = require("./models/Orientation");
const Deployment         = require("./models/Deployment");
const ApplicationEmailLog = require("./models/ApplicationEmailLog");

// case-insensitive exact-match regexes for each email
const rx = EMAILS.map(e =>
  new RegExp("^" + e.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i")
);

// [model, fieldName]
const TARGETS = [
  [Candidate,           "email"],
  [Interview,           "candidateEmail"],
  [OfferLetter,         "candidateEmail"],
  [Onboarding,          "candidateEmail"],
  [Orientation,         "candidateEmail"],
  [Deployment,          "candidateEmail"],
  [ApplicationEmailLog, "email"],
];

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) { console.error("No MONGO_URI in environment."); process.exit(1); }
  await mongoose.connect(uri);
  console.log(`Connected.${DRY ? "  (DRY RUN — nothing will be deleted)" : ""}`);
  console.log("Emails:", EMAILS.join(", "), "\n");

  let grandTotal = 0;
  for (const [Model, field] of TARGETS) {
    const query = { [field]: { $in: rx } };
    const count = await Model.countDocuments(query);
    grandTotal += count;
    if (DRY) {
      console.log(`  ${Model.modelName.padEnd(20)} would delete ${count}`);
    } else {
      const r = await Model.deleteMany(query);
      console.log(`  ${Model.modelName.padEnd(20)} deleted ${r.deletedCount}`);
    }
  }

  console.log(`\n${DRY ? "Would delete" : "Deleted"} ${grandTotal} record(s) total.`);
  console.log("\nNOTE: This clears the database only. The Google Form RESPONSE SHEET");
  console.log("rows are separate — delete those candidates' rows in the sheet by hand");
  console.log("if you want a 100% clean slate before re-submitting the onboarding form.");

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
