require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");

const authRoutes       = require("./routes/authRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const hrRoutes         = require("./routes/hrRoutes");
const shiftRoutes      = require("./routes/shiftRoutes");
const payrollRoutes    = require("./routes/payrollRoutes");
const importRoutes          = require("./routes/importRoutes");
const interviewOfferRoutes  = require("./routes/interviewOfferRoutes");
const candidateRoutes       = require("./routes/candidateRoutes");
const employeeRoutes        = require("./routes/employeeRoutes");
const requestRoutes         = require("./routes/requestRoutes");
const offboardingRoutes     = require("./routes/offboardingRoutes");
const onboardingRoutes      = require("./routes/onboardingRoutes");
const orientationRoutes     = require("./routes/orientationRoutes");
const deploymentRoutes      = require("./routes/deploymentRoutes");
const salesRoutes           = require("./routes/salesRoutes");
const lmsRoutes = require("./routes/lmsRoutes");
const userAdminRoutes = require("./routes/userAdminRoutes");

const app = express();

// ── DB ───────────────────────────────────────────────────────────
connectDB();

// ── TRUST PROXY (required for Railway) ──────────────────────────
app.set("trust proxy", 1);

// ── SECURITY HEADERS ─────────────────────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,               // set in Railway env vars
  "https://zyntrixsoftware.com",
  "https://www.zyntrixsoftware.com",
  // Render backend
  "https://zyntrix-crm-backend.onrender.com",
  // Railway backend talking to itself (health checks etc)
  "https://zyntrixcrmbackend-production.up.railway.app",
  "https://zyntrixbackend-production-d32c.up.railway.app",
  "http://localhost:5500",               // VS Code Live Server
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://localhost:5000",
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow Postman / curl (no origin header)
    if (!origin) return callback(null, true);
    // Exact match
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Allow any *.zyntrixsoftware.com subdomain
    if (/^https:\/\/([a-z0-9-]+\.)?zyntrixsoftware\.com$/.test(origin)) return callback(null, true);
    console.warn("CORS blocked origin:", origin);
    callback(new Error("CORS: origin not allowed — " + origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

// Handle pre-flight OPTIONS for all routes BEFORE other middleware
app.options(/(.*)/, cors(corsOptions));
app.use(cors(corsOptions));

// ── BODY PARSER ──────────────────────────────────────────────────
// Default limit is generous enough for spreadsheet imports (Candidates page
// posts the full 142-row × 16-column dataset including each row's raw payload).
// Rate limiter below still protects against abuse.
app.use(express.json({ limit: "25mb" }));

// ── RATE LIMITERS ────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: "Too many requests — try again in 15 minutes." }
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: "Too many requests — please slow down." }
});

// Public candidate onboarding upload page (reads ?token client-side)
// Serve static assets for the onboarding page (e.g. /onboarding.js)
app.use(express.static(require("path").join(__dirname, "public")));

app.get("/onboarding", (req, res) => {
  // Override helmet's strict CSP for this self-served HTML page (inline CSS/JS + Google Fonts).
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; " +
    "img-src 'self' data:; " +
    "connect-src 'self'");
  res.sendFile(require("path").join(__dirname, "public", "onboarding.html"));
});

app.use("/api/", generalLimiter);
app.use("/api/auth/", authLimiter);

// ── ROUTES ───────────────────────────────────────────────────────
app.use("/api/auth",       authRoutes);
app.use("/api/employee",   employeeRoutes);         // employee self-service profile
app.use("/api/attendance", attendanceRoutes);
app.use("/api/requests",   requestRoutes);          // leave / shift-swap requests (employee side)
app.use("/api/hr",         hrRoutes);
app.use("/api/shifts",     shiftRoutes);
app.use("/api/payroll",    payrollRoutes);
app.use("/api/import",     importRoutes);
app.use("/api/hr",         interviewOfferRoutes);   // interview + offer letter panel
app.use("/api/hr",         candidateRoutes);        // candidate import + shortlist
app.use("/api/hr",         offboardingRoutes);      // employee offboarding / separation
app.use("/api/hr",         onboardingRoutes);       // candidate onboarding + doc webhook
app.use("/api/hr",         orientationRoutes);      // candidate orientation + session schedule
app.use("/api/hr",         deploymentRoutes);       // team deployment after orientation
app.use("/api",            salesRoutes);             // student course sales system
app.use("/api/lms",        lmsRoutes);              // learning management system
app.use("/api/admin",      userAdminRoutes);        // admin user management

// ── HEALTH CHECK ─────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status:      "ok",
    message:     "ZyntrixCRM API Running",
    environment: process.env.NODE_ENV || "development",
    timestamp:   new Date().toISOString()
  });
});

// ── GLOBAL ERROR HANDLER ─────────────────────────────────────────
// Respect the error's own status code where possible so clients see
// meaningful 4xx responses (body too large, bad JSON, etc.) instead of
// a generic 500. Falls back to 500 for truly unexpected errors.
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  // PayloadTooLargeError — body parser rejected the request
  if (err.type === "entity.too.large" || status === 413) {
    console.warn("Payload too large:", req.method, req.originalUrl, "limit=", err.limit, "received=", err.length);
    return res.status(413).json({
      msg: "Upload too large. Try fewer rows, or contact admin to raise the import limit."
    });
  }

  // Malformed JSON
  if (err.type === "entity.parse.failed") {
    console.warn("Bad JSON body:", req.method, req.originalUrl, err.message);
    return res.status(400).json({ msg: "Request body is not valid JSON." });
  }

  console.error("Unhandled error:", req.method, req.originalUrl, "—", err.stack || err);
  res.status(status >= 400 && status < 600 ? status : 500).json({
    msg: status >= 500 ? "Internal server error" : (err.message || "Request failed")
  });
});

// ── START ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("ZyntrixCRM API running on port " + PORT);
  console.log("Allowed CORS origins:", allowedOrigins);
});

// ── ONE-TIME LEADGEN SEED (remove after first use) ────────────────
// Hit: GET /setup-leadgen?key=ZyntrixLeadgen2026
// This creates lead@zyntrixsoftware.com with role=leadgen
app.get("/setup-leadgen", async (req, res) => {
  if (req.query.key !== "ZyntrixLeadgen2026") {
    return res.status(403).json({ msg: "Forbidden" });
  }
  try {
    const bcrypt = require("bcryptjs");
    const User   = require("./models/user");
    const hash   = await bcrypt.hash("Leadgen@2026", 10);
    const doc    = await User.findOneAndUpdate(
      { email: "lead@zyntrixsoftware.com" },
      { $set: { name:"LeadGen Team", email:"lead@zyntrixsoftware.com", password:hash, role:"leadgen", isActive:true } },
      { upsert:true, new:true }
    );
    return res.json({
      ok: true,
      msg: "LeadGen user created / updated",
      id:    doc._id,
      email: doc.email,
      role:  doc.role,
      credentials: { email:"lead@zyntrixsoftware.com", password:"Leadgen@2026" }
    });
  } catch (e) {
    return res.status(500).json({ ok:false, msg:e.message });
  }
});
