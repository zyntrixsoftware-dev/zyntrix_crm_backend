const express = require("express");
const router  = express.Router();
const C       = require("../controllers/salesController");

// Public — Razorpay calls this with no JWT; signature is verified in the handler.
router.post("/webhook", C.razorpayWebhook);

module.exports = router;
