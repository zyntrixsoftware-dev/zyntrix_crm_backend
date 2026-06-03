// One-time backfill: seed ApplicationEmailLog from candidates that already
// received the "Application Received" email (applicationEmailSentAt set).
// This protects everyone you've emailed so far from being re-emailed on the
// next import. Safe to run multiple times (upserts).
//
//   node backfill-application-email-log.js
//
require("dotenv").config();
const mongoose = require("mongoose");
const Candidate = require("./models/Candidate");
const ApplicationEmailLog = require("./models/ApplicationEmailLog");

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
  if (!uri) { console.error("No MONGO_URI in env."); process.exit(1); }
  await mongoose.connect(uri);
  console.log("Connected. Scanning candidates already emailed…");

  const cursor = Candidate.find({ applicationEmailSentAt: { $ne: null } })
    .select("createdBy email applicationEmailSentAt")
    .cursor();

  let seen = 0, inserted = 0;
  for (let c = await cursor.next(); c != null; c = await cursor.next()) {
    const email = String(c.email || "").trim().toLowerCase();
    if (!email || !c.createdBy) continue;
    seen++;
    try {
      const r = await ApplicationEmailLog.updateOne(
        { createdBy: c.createdBy, email },
        { $setOnInsert: { sentAt: c.applicationEmailSentAt || new Date() } },
        { upsert: true }
      );
      if (r.upsertedCount) inserted++;
    } catch (e) { /* duplicate key — already logged */ }
  }

  console.log(`Done. Scanned ${seen} emailed candidates, added ${inserted} new log entries.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });
