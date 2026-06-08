const mongoose = require("mongoose");
const fileSchema = new mongoose.Schema({ fileName:{type:String,default:""}, fileKey:{type:String,default:""}, fileUrl:{type:String,default:""}, size:{type:Number,default:0} },{_id:true});
const s = new mongoose.Schema({
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: "LMSAssignment", required: true },
  course:     { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  student:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text:       { type: String, default: "" },
  files:      { type: [fileSchema], default: [] },
  submittedAt:{ type: Date, default: Date.now },
  status:     { type: String, enum: ["submitted","graded","late"], default: "submitted" },
  marks:      { type: Number, default: null },
  feedback:   { type: String, default: "" },
  gradedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  gradedAt:   { type: Date, default: null },
}, { timestamps: true });
s.index({ assignment: 1, student: 1 }, { unique: true });
s.index({ student: 1 });
module.exports = mongoose.model("LMSSubmission", s);
