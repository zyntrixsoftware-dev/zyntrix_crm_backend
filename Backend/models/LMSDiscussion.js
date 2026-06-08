const mongoose = require("mongoose");
const replySchema = new mongoose.Schema({
  by:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  byName:  { type: String, default: "" },
  role:    { type: String, default: "" },
  message: { type: String, default: "" },
  at:      { type: Date, default: Date.now },
},{_id:true});
const s = new mongoose.Schema({
  course:   { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  lesson:   { type: mongoose.Schema.Types.ObjectId, ref: "LMSLesson", default: null },
  student:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  studentName:{ type: String, default: "" },
  message:  { type: String, required: true },
  replies:  { type: [replySchema], default: [] },
  status:   { type: String, enum: ["open","answered"], default: "open" },
}, { timestamps: true });
s.index({ course: 1, createdAt: -1 });
module.exports = mongoose.model("LMSDiscussion", s);
