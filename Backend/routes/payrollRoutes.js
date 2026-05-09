const express = require("express");
const { getMyPayroll, getMyPayrollHistory, getPayrollRecords, updatePayrollStatus } = require("../controllers/payrollController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/my",          auth, getMyPayroll);           // canonical: /api/payroll/my
router.get("/history",     auth, getMyPayrollHistory);
router.get("/records",     auth, getPayrollRecords);
router.patch("/:id/status", auth, updatePayrollStatus);

module.exports = router;
