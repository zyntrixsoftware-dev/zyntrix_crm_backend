const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const C       = require("../controllers/salesController");

router.use(auth);

// ── Reports (declare before /:id routes) ─────────────────────────
router.get("/sales/reports/pipeline",         C.reportPipeline);
router.get("/sales/reports/revenue",          C.reportRevenue);
router.get("/sales/reports/conversion",       C.reportConversion);
router.get("/sales/reports/rep-performance",  C.reportRepPerformance);

// ── Student Leads ────────────────────────────────────────────────
router.get   ("/sales/leads/stats",       C.leadsStats);
router.get   ("/sales/leads",             C.listLeads);
router.post  ("/sales/leads",             C.createLead);
router.get   ("/sales/leads/:id",         C.getLead);
router.patch ("/sales/leads/:id",         C.updateLead);
router.patch ("/sales/leads/:id/stage",   C.moveStage);
router.delete("/sales/leads/:id",         C.deleteLead);

// ── Courses ──────────────────────────────────────────────────────
router.get   ("/sales/courses",           C.listCourses);
router.post  ("/sales/courses",           C.createCourse);
router.get   ("/sales/courses/:id",       C.getCourse);
router.patch ("/sales/courses/:id",       C.updateCourse);
router.delete("/sales/courses/:id",       C.deleteCourse);

// ── Batches ──────────────────────────────────────────────────────
router.get   ("/sales/batches",                    C.listBatches);
router.post  ("/sales/batches",                    C.createBatch);
router.get   ("/sales/batches/:id",                C.getBatch);
router.patch ("/sales/batches/:id",                C.updateBatch);
router.delete("/sales/batches/:id",                C.deleteBatch);
router.get   ("/sales/batches/:id/enrollments",    C.getBatchEnrollments);

// ── Demo Sessions ────────────────────────────────────────────────
router.get   ("/sales/demos",                      C.listDemos);
router.post  ("/sales/demos",                      C.createDemo);
router.get   ("/sales/demos/:id",                  C.getDemo);
router.patch ("/sales/demos/:id",                  C.updateDemo);
router.delete("/sales/demos/:id",                  C.deleteDemo);
router.post  ("/sales/demos/:id/send-reminder",    C.sendDemoReminder);

// ── Enrollments ──────────────────────────────────────────────────
router.get   ("/sales/enrollments",        C.listEnrollments);
router.post  ("/sales/enrollments",        C.createEnrollment);
router.get   ("/sales/enrollments/:id",    C.getEnrollment);
router.patch ("/sales/enrollments/:id",    C.updateEnrollment);
router.delete("/sales/enrollments/:id",    C.deleteEnrollment);

// ── Payments ─────────────────────────────────────────────────────
router.get   ("/sales/payments/summary",   C.paymentSummary);
router.get   ("/sales/payments",           C.listPayments);
router.post  ("/sales/payments",           C.createPayment);
router.patch ("/sales/payments/:id",       C.updatePayment);
router.delete("/sales/payments/:id",       C.voidPayment);

// ── Follow-Ups ───────────────────────────────────────────────────
router.get   ("/sales/followups/today",    C.todayFollowUps);
router.get   ("/sales/followups",          C.listFollowUps);
router.post  ("/sales/followups",          C.createFollowUp);
router.patch ("/sales/followups/:id",      C.updateFollowUp);
router.delete("/sales/followups/:id",      C.deleteFollowUp);

// ── Sales Targets ────────────────────────────────────────────────
router.get   ("/sales/targets/dashboard",  C.targetsDashboard);
router.get   ("/sales/targets",            C.listTargets);
router.post  ("/sales/targets",            C.upsertTarget);

module.exports = router;
