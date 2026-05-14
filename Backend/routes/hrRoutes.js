const express = require("express");
const {
  getDashboard,
  getShiftRequests,
  updateShiftRequestStatus,
  getEmployeeAttendance,
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  terminateEmployee,
  getDepartments,
  getHrmsDashboard
} = require("../controllers/hrController");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

// ── LEGACY (employee system uses these) ──────────────────────────
router.get("/dashboard",                     auth, getDashboard);
router.get("/shift-requests",                auth, getShiftRequests);
router.patch("/shift-requests/:id/status",   auth, updateShiftRequestStatus);
router.get("/employee/:userId/attendance",   auth, getEmployeeAttendance);

// ── HRMS DASHBOARD ────────────────────────────────────────────────
router.get("/hrms/dashboard",                auth, getHrmsDashboard);

// ── EMPLOYEE MANAGEMENT ───────────────────────────────────────────
// IMPORTANT: /employees/departments MUST be before /employees/:id
// otherwise Express treats "departments" as the :id param
router.get("/employees",                     auth, getEmployees);
router.get("/employees/departments",         auth, getDepartments);  // ← must be before /:id
router.post("/employees",                    auth, createEmployee);
router.get("/employees/:id",                 auth, getEmployee);     // ← after named routes
router.put("/employees/:id",                 auth, updateEmployee);
router.patch("/employees/:id/terminate",     auth, terminateEmployee);

module.exports = router;
