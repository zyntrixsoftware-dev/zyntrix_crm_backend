const mongoose = require("mongoose");
const qSchema = new mongoose.Schema({
  q:           { type: String, required: true },
  options:     { type: [String], default: [] },
  correctIndex:{ type: Number, default: 0 },
  marks:       { type: Number, default: 1 },
},{_id:true});
const s = new mongoose.Schema({
  course:        { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  module:        { type: mongoose.Schema.Types.ObjectId, ref: "LMSModule", default: null },
  title:         { type: String, required: true, trim: true },
  description:   { type: String, default: "" },
  questions:     { type: [qSchema], default: [] },
  passMark:      { type: Number, default: 50 },   // percent
  timeLimitMin:  { type: Number, default: 0 },     // 0 = no limit
  attemptsAllowed:{ type: Number, default: 0 },     // 0 = unlimited
  isPublished:   { type: Boolean, default: true },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
s.index({ course: 1, createdAt: -1 });
module.exports = mongoose.model("LMSQuiz", s);
