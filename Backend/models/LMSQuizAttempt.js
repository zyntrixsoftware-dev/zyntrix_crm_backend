const mongoose = require("mongoose");
const s = new mongoose.Schema({
  quiz:       { type: mongoose.Schema.Types.ObjectId, ref: "LMSQuiz", required: true },
  course:     { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  student:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  answers:    { type: [Number], default: [] },
  score:      { type: Number, default: 0 },   // marks scored
  total:      { type: Number, default: 0 },   // total marks
  percent:    { type: Number, default: 0 },
  passed:     { type: Boolean, default: false },
  startedAt:  { type: Date, default: Date.now },
  submittedAt:{ type: Date, default: Date.now },
}, { timestamps: true });
s.index({ quiz: 1, student: 1 });
module.exports = mongoose.model("LMSQuizAttempt", s);
