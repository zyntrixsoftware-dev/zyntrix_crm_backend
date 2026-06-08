const mongoose = require("mongoose");
const s = new mongoose.Schema({
  course:       { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  title:        { type: String, required: true, trim: true },
  description:  { type: String, default: "" },
  scheduledAt:  { type: Date, required: true },
  durationMin:  { type: Number, default: 60 },
  joinUrl:      { type: String, default: "" },     // Zoom / Meet / Teams link
  recordingUrl: { type: String, default: "" },     // added after the class
  instructorName:{ type: String, default: "" },
  status:       { type: String, enum: ["scheduled","live","completed","cancelled"], default: "scheduled" },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
s.index({ course: 1, scheduledAt: 1 });
module.exports = mongoose.model("LMSClassSession", s);
