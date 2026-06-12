// Public (no-auth) routes for the website Courses page.
// Mounted BEFORE the global-auth salesRoutes so these stay open to visitors.
const express = require("express");
const router  = express.Router();
const P       = require("../controllers/publicController");

router.get ("/courses",     P.listCourses);   // live catalogue
router.get ("/sales-reps",  P.listSalesReps); // dropdown of sales employees
router.post("/enroll",      P.enroll);        // create lead + UPI link

module.exports = router;
