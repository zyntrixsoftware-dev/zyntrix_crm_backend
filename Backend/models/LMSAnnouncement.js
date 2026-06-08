const mongoose = require("mongoose");
const s = new mongoose.Schema({
  course:   { type: mongoose.Schema.Types.ObjectId, ref: "Course", default: null }, // null = all courses
  title:    { type: String, required: true, trim: true },
  body:     { type: String, default: "" },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  postedByName: { type: String, default: "" },
}, { timestamps: true });
s.index({ course: 1, createdAt: -1 });
module.exports = mongoose.model("LMSAnnouncement", s);
