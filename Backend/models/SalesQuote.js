const mongoose = require("mongoose");
const s = new mongoose.Schema({
  prospectName: { type: String, required: true, trim: true },
  lead:         { type: mongoose.Schema.Types.ObjectId, ref: "StudentLead", default: null },
  course:       { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null },
  courseTitle:  { type: String, default: "" },
  basePrice:    { type: Number, default: 0 },
  discountPct:  { type: Number, default: 0 },
  gstPct:       { type: Number, default: 18 },
  total:        { type: Number, default: 0 },
  status:       { type: String, enum: ["draft","sent","accepted","rejected"], default: "sent" },
  notes:        { type: String, default: "" },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdByName:{ type: String, default: "" },
}, { timestamps: true });
s.index({ createdAt: -1 });
module.exports = mongoose.model("SalesQuote", s);
