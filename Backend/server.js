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
app.use(express.json({ limit: "10kb" }));

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

app.use("/api/", generalLimiter);
app.use("/api/auth/", authLimiter);

// ── ROUTES ───────────────────────────────────────────────────────
app.use("/api/auth",       authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/hr",         hrRoutes);
app.use("/api/shifts",     shiftRoutes);
app.use("/api/payroll",    payrollRoutes);
app.use("/api/import",     importRoutes);
app.use("/api/hr",         interviewOfferRoutes);   // interview + offer letter panel

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
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);
  res.status(500).json({ msg: "Internal server error" });
});

// ── START ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("ZyntrixCRM API running on port " + PORT);
  console.log("Allowed CORS origins:", allowedOrigins);
});
