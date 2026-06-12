// Public (no-auth) endpoints for the zyntrixsoftware.com Courses page.
// Anyone can browse the live course catalogue and start a self-enrolment that
// (1) creates a Student Lead assigned to the chosen sales employee, and
// (2) returns a UPI payment link/QR for the amount the student wants to pay now.
// Payment is confirmed manually by the rep in their Workstation (UPI = no gateway).

const Course      = require("../models/Course");
const User        = require("../models/user");
const StudentLead = require("../models/StudentLead");

let emails;
try { emails = require("../utils/studentEmails"); } catch (_) { emails = null; }

// Same definition the Sales system uses for assignable reps.
const SALES_REP_FILTER = { active: true, role: "employee", department: { $regex: /sales/i } };

const esc = (x) => String(x == null ? "" : x).trim();

// ── GET /api/public/courses ──────────────────────────────────────────────────
// Live catalogue — reads the SAME Course collection the LMS/Sales pages write to,
// so any change made there is reflected here automatically. Active courses only,
// and only public-safe fields are exposed.
exports.listCourses = async (req, res) => {
  try {
    const courses = await Course.find({ isActive: true })
      .sort({ createdAt: -1 })
      .select("title slug description category track level tags durationWeeks price discountPrice mode highlights")
      .lean();
    return res.json({ courses });
  } catch (e) {
    console.error("public.listCourses:", e);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── GET /api/public/sales-reps ───────────────────────────────────────────────
// Names only (id + name) for the "sales employee" dropdown on the payment form.
exports.listSalesReps = async (req, res) => {
  try {
    const reps = await User.find(SALES_REP_FILTER).select("_id name").sort({ name: 1 }).lean();
    return res.json({ reps: reps.map(r => ({ _id: r._id, name: r.name })) });
  } catch (e) {
    console.error("public.listSalesReps:", e);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ── POST /api/public/enroll ──────────────────────────────────────────────────
// body: { name, email, phone, courseId, repId, amount }
// Creates a Student Lead assigned to the rep (payment pending) and returns a UPI
// link + the company UPI ID + a WhatsApp/SMS share + QR data for the amount.
exports.enroll = async (req, res) => {
  try {
    const name    = esc(req.body.name);
    const email   = esc(req.body.email).toLowerCase();
    const phone   = esc(req.body.phone).replace(/[^\d+]/g, "");
    const courseId = esc(req.body.courseId);
    const repId    = esc(req.body.repId);
    const amount   = Math.round(Number(req.body.amount));

    if (!name)  return res.status(400).json({ msg: "Please enter your name." });
    if (!email && !phone) return res.status(400).json({ msg: "Please enter an email or phone number." });
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ msg: "Please enter a valid email." });
    if (!courseId.match(/^[a-f0-9]{24}$/i)) return res.status(400).json({ msg: "Please select a course." });
    if (!repId.match(/^[a-f0-9]{24}$/i))    return res.status(400).json({ msg: "Please choose a sales employee." });
    if (!Number.isFinite(amount) || amount < 1) return res.status(400).json({ msg: "Please enter the amount you want to pay." });
    if (amount > 10000000) return res.status(400).json({ msg: "Amount is too large." });

    const course = await Course.findOne({ _id: courseId, isActive: true }).select("title").lean();
    if (!course) return res.status(404).json({ msg: "Course not found or no longer available." });

    const rep = await User.findOne({ _id: repId, ...SALES_REP_FILTER }).select("_id name email").lean();
    if (!rep) return res.status(404).json({ msg: "Selected sales employee not found." });

    // Create the lead (assigned to the chosen rep, source = website).
    const lead = await StudentLead.create({
      fullName:       name,
      email:          email,
      phone:          phone,
      courseInterest: course._id,
      assignedTo:     rep._id,
      source:         "website",
      origin:         "other",
      pipelineStage:  "new_lead",
      budget:         amount,
      notes:          "Self-enrolled via website Courses page. Requested to pay ₹" +
                      amount.toLocaleString("en-IN") + " for " + course.title +
                      ". Sales employee: " + rep.name + ". Payment pending confirmation."
    });

    // Build the UPI payment link (no gateway — direct to company UPI ID).
    const upiId   = (process.env.COMPANY_UPI_ID   || "").trim();
    const upiName = (process.env.COMPANY_UPI_NAME || process.env.COMPANY_NAME || "Zyntrix Software Solutions").trim();
    if (!upiId) {
      // Lead is still captured; just can't produce a pay link.
      return res.status(200).json({
        ok: true, leadCreated: true, upiConfigured: false,
        msg: "Your details were received. Our team will contact you shortly to complete payment.",
        course: course.title, rep: rep.name, amount
      });
    }

    const params = new URLSearchParams({
      pa: upiId, pn: upiName, am: String(amount), cu: "INR",
      tn: ("Fee " + course.title).slice(0, 60), tr: "web" + String(lead._id)
    });
    const payUrl = "upi://pay?" + params.toString().replace(/\+/g, "%20");

    const digits = phone.replace(/\D/g, "");
    const waNum  = digits ? (digits.length === 10 ? "91" + digits : digits) : "";
    const shareMsg = "Hi " + name + ", pay your course fee of ₹" + amount.toLocaleString("en-IN") +
      " for " + course.title + " to UPI ID " + upiId + " (or tap on phone: " + payUrl + ")";

    // Email the student the UPI link (best-effort).
    if (emails && email) {
      try { await emails.notifyPaymentLink({ fullName: name, email }, { courseTitle: course.title, amount, url: payUrl, upiId }); }
      catch (e) { console.warn("public.enroll email(student):", e.message); }
    }
    // Notify the rep they have a new web enrolment (best-effort).
    if (emails && rep.email) {
      try {
        const sendEmail = require("../utils/sendEmail");
        const body = "New website enrolment assigned to you.\n\nStudent: " + name +
          "\nEmail: " + (email || "—") + "\nPhone: " + (phone || "—") +
          "\nCourse: " + course.title + "\nAmount to pay: ₹" + amount.toLocaleString("en-IN") +
          "\n\nThe lead is in your Workstation. Confirm the payment once received.";
        await sendEmail(rep.email, "New website enrolment — " + name, body);
      } catch (e) { console.warn("public.enroll email(rep):", e.message); }
    }

    return res.json({
      ok: true, leadCreated: true, upiConfigured: true,
      course: course.title, rep: rep.name, amount,
      upiId, upiName, url: payUrl,
      qr: "https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=" + encodeURIComponent(payUrl),
      whatsapp: waNum ? ("https://wa.me/" + waNum + "?text=" + encodeURIComponent(shareMsg)) : "",
      sms: digits ? ("sms:" + phone + "?body=" + encodeURIComponent(shareMsg)) : "",
      emailed: !!email
    });
  } catch (err) {
    console.error("public.enroll:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};
