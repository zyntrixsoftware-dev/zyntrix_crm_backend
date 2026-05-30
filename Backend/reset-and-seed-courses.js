/**
 * Reset Sales pipeline data + reseed the tech-only Course catalogue.
 *
 * WHAT IT DOES (destructive — use on test data only):
 *   1. DELETES every document in: StudentLead, DemoSession, FollowUp,
 *      Enrollment, Payment, CommLog, Referral, Batch, Course
 *   2. INSERTS a fresh set of tech courses
 *   It does NOT touch Users / HR / any other collection.
 *
 * Usage:
 *   node reset-and-seed-courses.js --yes
 *   (On Render: Service → Shell tab → run the same command)
 *
 * The --yes flag is required so you can't wipe data by accident.
 */

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error("❌  MONGO_URI not set in .env"); process.exit(1); }
if (!process.argv.includes("--yes")) {
  console.error("⚠️  This DELETES all leads/demos/follow-ups/enrollments/payments/batches/courses.");
  console.error("    Re-run with the --yes flag to confirm:");
  console.error("    node reset-and-seed-courses.js --yes");
  process.exit(1);
}

const slugify = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Tech-only catalogue
const COURSES = [
  { title: "Web Development",              track: "web_dev",       durationWeeks: 16, price: 35000, discountPrice: 27000, description: "Front-end to back-end: HTML/CSS, JavaScript, React and Node." },
  { title: "AI & Machine Learning",        track: "data_ai",       durationWeeks: 20, price: 45000, discountPrice: 38000, description: "Supervised/unsupervised ML, model building and deployment." },
  { title: "AI & Data Science",            track: "data_ai",       durationWeeks: 24, price: 50000, discountPrice: 42000, description: "Python, statistics, data wrangling, visualisation and ML." },
  { title: "Cybersecurity",                track: "cybersecurity", durationWeeks: 16, price: 40000, discountPrice: 32000, description: "Network security, ethical hacking and threat defence." },
  { title: "App Development",              track: "mobile",        durationWeeks: 16, price: 35000, discountPrice: 28000, description: "Build Android & iOS apps with modern frameworks." },
  { title: "Cloud Computing & DevOps",     track: "cloud_devops",  durationWeeks: 14, price: 38000, discountPrice: 30000, description: "AWS, Docker, Kubernetes and CI/CD pipelines." },
  { title: "Data Structures & Algorithms", track: "programming",   durationWeeks: 10, price: 20000, discountPrice: 15000, description: "Core DSA and problem-solving for interviews." }
];

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("✅  MongoDB connected\n");

  const Course      = require("./models/Course");
  const Batch       = require("./models/Batch");
  const StudentLead = require("./models/StudentLead");
  const DemoSession = require("./models/DemoSession");
  const FollowUp    = require("./models/FollowUp");
  const Enrollment  = require("./models/Enrollment");
  const Payment     = require("./models/Payment");
  const CommLog     = require("./models/CommLog");
  const Referral    = require("./models/Referral");

  // 1) wipe pipeline + catalogue
  const wipe = [
    ["StudentLead", StudentLead], ["DemoSession", DemoSession], ["FollowUp", FollowUp],
    ["Enrollment", Enrollment],   ["Payment", Payment],         ["CommLog", CommLog],
    ["Referral", Referral],       ["Batch", Batch],             ["Course", Course]
  ];
  console.log("🧹  Clearing collections:");
  for (const [name, Model] of wipe) {
    const { deletedCount } = await Model.deleteMany({});
    console.log(`    - ${name.padEnd(12)} removed ${deletedCount}`);
  }

  // 2) seed fresh tech courses
  console.log("\n📚  Seeding tech courses:");
  for (const c of COURSES) {
    const doc = await Course.create({
      title:         c.title,
      slug:          slugify(c.title),
      description:   c.description,
      category:      "tech",
      track:         c.track,
      level:         "beginner",
      durationWeeks: c.durationWeeks,
      price:         c.price,
      discountPrice: c.discountPrice,
      mode:          "online",
      isActive:      true
    });
    console.log(`    + ${doc.title}  (${doc.track})`);
  }

  console.log("\n✅  Done. Catalogue reset to", COURSES.length, "tech courses; pipeline data cleared.");
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error("❌ ", e.message); process.exit(1); });
