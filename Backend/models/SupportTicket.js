const mongoose = require("mongoose");
const reply = new mongoose.Schema({ by:{type:mongoose.Schema.Types.ObjectId,ref:"User"}, byName:{type:String,default:""}, message:{type:String,default:""}, at:{type:Date,default:Date.now} },{_id:true});
const s = new mongoose.Schema({
  studentName:  { type: String, required: true, trim: true },
  studentEmail: { type: String, default: "" },
  enrollment:   { type: mongoose.Schema.Types.ObjectId, ref: "Enrollment", default: null },
  subject:      { type: String, required: true },
  category:     { type: String, default: "Other" },
  priority:     { type: String, enum: ["low","medium","high"], default: "medium" },
  status:       { type: String, enum: ["open","in_progress","resolved"], default: "open" },
  replies:      { type: [reply], default: [] },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
s.index({ status: 1, createdAt: -1 });
module.exports = mongoose.model("SupportTicket", s);
