/**
 * Back-fill the Course (courseInterest) on existing leads that were imported
 * before course-matching was live. Matches each lead (by phone) to a catalogue
 * Course by name — exact, then partial, then tech-track keyword.
 *
 * Safe: only sets courseInterest on the listed leads. Touches nothing else.
 *
 * Prereq: the tech courses must exist in the catalogue (run seed-courses-only.js first).
 * Usage:  node link-lead-courses.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error("❌  MONGO_URI not set"); process.exit(1); }

// phone -> course name (from your imported sheet)
const MAP = {
  "9900001001": "Web Development",
  "9900001002": "AI & Data Science",
  "9900001003": "AI & Machine Learning",
  "9900001004": "Cloud & DevOps",
  "9900001005": "Cybersecurity",
  "9900001006": "Web Development",
  "9900001007": "Web Development",
  "9900001008": "Cloud & DevOps",
  "9900001009": "Mobile App Development",
  "9900001010": "AI & Data Science",
  "9900001011": "AI & Machine Learning",
  "9900001012": "Web Development",
  "9900001013": "python programming",
  "9900001014": "Cloud & DevOps",
  "9900001015": "Cybersecurity",
  "9900001016": "AI & Data Science",
  "9900001017": "Web Development",
  "9900001018": "Web Development",
  "9900001019": "Cloud & DevOps",
  "9900001020": "AI & Machine Learning",
  "9900001021": "python programming",
  "9900001022": "Web Development",
  "9900001023": "Cloud & DevOps",
  "9900001024": "AI & Data Science",
  "9900001025": "Programming Fundamentals"
};

const norm = v => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const TRACK_KEYWORDS = {
  web_dev:       ["web", "full stack", "fullstack", "mern", "react", "frontend", "backend", "javascript", "node"],
  data_ai:       ["data science", "data", "machine learning", "deep learning", "artificial intelligence", "analytics", "ml", "ai"],
  cloud_devops:  ["cloud", "aws", "azure", "gcp", "devops", "kubernetes", "docker"],
  cybersecurity: ["cyber", "security", "ethical hack", "pentest"],
  mobile:        ["app", "android", "ios", "flutter", "mobile", "react native", "kotlin", "swift"],
  programming:   ["dsa", "data structure", "algorithm", "programming", "c++", "java", "python"]
};

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("✅  MongoDB connected");
  const StudentLead = require("./models/StudentLead");
  const Course      = require("./models/Course");

  const courses = await Course.find({}, "_id title track").lean();
  if (!courses.length) {
    console.error("❌  No courses in the catalogue. Run seed-courses-only.js first, then re-run this.");
    process.exit(1);
  }
  const resolve = raw => {
    const want = norm(raw);
    if (!want) return null;
    let hit = courses.find(c => norm(c.title) === want);
    if (!hit) hit = courses.find(c => norm(c.title).includes(want) || want.includes(norm(c.title)));
    if (!hit) for (const [t, words] of Object.entries(TRACK_KEYWORDS)) {
      if (words.some(w => want.includes(w))) { hit = courses.find(c => c.track === t); if (hit) break; }
    }
    return hit || null;
  };

  let linked = 0, noLead = 0, noMatch = 0;
  for (const [phone, courseName] of Object.entries(MAP)) {
    const lead = await StudentLead.findOne({ phone });
    if (!lead) { noLead++; continue; }
    const course = resolve(courseName);
    if (!course) { noMatch++; console.log(`    ? no course match for "${courseName}" (${phone})`); continue; }
    await StudentLead.updateOne({ _id: lead._id }, { $set: { courseInterest: course._id } });
    linked++;
    console.log(`    ✓ ${lead.fullName.padEnd(18)} → ${course.title}`);
  }

  console.log(`\n✅  Linked ${linked} leads · ${noLead} phone not found · ${noMatch} unmatched course.`);
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error("❌ ", e.message); process.exit(1); });
