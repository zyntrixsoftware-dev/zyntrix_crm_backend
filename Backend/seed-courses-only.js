/**
 * Reset ONLY the Course catalogue to the tech tracks (Web Development,
 * Data Science & AI, Cloud & DevOps, Cybersecurity, Mobile, Programming).
 * Removes every other course. Does NOT touch leads / demos / enrollments / anything else.
 *
 * Uses findOneAndUpdate upsert (the same path your Import button uses), so it
 * works even while the Add Course button is throwing a 500.
 *
 * Usage:   node seed-courses-only.js --yes
 *          (Render → service → Shell tab → run the same command)
 */

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error("❌  MONGO_URI not set"); process.exit(1); }
if (!process.argv.includes("--yes")) {
  console.error("⚠️  This DELETES all courses and reseeds only the tech-track courses.");
  console.error("    Re-run with --yes to confirm:  node seed-courses-only.js --yes");
  process.exit(1);
}

const slugify = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// One course per track shown in the dropdown
const COURSES = [
  { title: "Web Development",              track: "web_dev",       durationWeeks: 16, price: 35000, discountPrice: 27000, description: "Front-end to back-end: HTML/CSS, JavaScript, React and Node." },
  { title: "AI & Machine Learning",        track: "data_ai",       durationWeeks: 20, price: 45000, discountPrice: 38000, description: "Supervised/unsupervised ML, model building and deployment." },
  { title: "AI & Data Science",            track: "data_ai",       durationWeeks: 24, price: 50000, discountPrice: 42000, description: "Python, statistics, data wrangling, visualisation and ML." },
  { title: "Cloud & DevOps",               track: "cloud_devops",  durationWeeks: 14, price: 38000, discountPrice: 30000, description: "AWS, Docker, Kubernetes and CI/CD pipelines." },
  { title: "Cybersecurity",                track: "cybersecurity", durationWeeks: 16, price: 40000, discountPrice: 32000, description: "Network security, ethical hacking and threat defence." },
  { title: "Mobile App Development",       track: "mobile",        durationWeeks: 16, price: 35000, discountPrice: 28000, description: "Build Android & iOS apps with modern frameworks." },
  { title: "Programming Fundamentals",     track: "programming",   durationWeeks: 10, price: 20000, discountPrice: 15000, description: "Core programming, data structures and algorithms." }
];

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log("✅  MongoDB connected");
  const Course = require("./models/Course");

  const { deletedCount } = await Course.deleteMany({});
  console.log(`🧹  Removed ${deletedCount} existing course(s)\n`);

  console.log("📚  Seeding tech courses:");
  for (const c of COURSES) {
    const doc = await Course.findOneAndUpdate(
      { slug: slugify(c.title) },
      { $set: {
          title: c.title, slug: slugify(c.title), description: c.description,
          category: "tech", track: c.track, level: "beginner",
          durationWeeks: c.durationWeeks, price: c.price, discountPrice: c.discountPrice,
          mode: "online", isActive: true
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`    + ${doc.title.padEnd(26)} (${doc.track})`);
  }

  console.log(`\n✅  Catalogue is now ${COURSES.length} tech courses; everything else removed.`);
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error("❌ ", e.message); process.exit(1); });
