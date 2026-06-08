const mongoose = require("mongoose");
const fileSchema = new mongoose.Schema({ fileName:{type:String,default:""}, fileKey:{type:String,default:""}, fileUrl:{type:String,default:""}, size:{type:Number,default:0} },{_id:true});
const s = new mongoose.Schema({
  course:      { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  module:      { type: mongoose.Schema.Types.ObjectId, ref: "LMSModule", default: null },
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  instructions:{ type: String, default: "" },
  attachments: { type: [fileSchema], default: [] },
  maxMarks:    { type: Number, default: 100 },
  dueDate:     { type: Date, default: null },
  isPublished: { type: Boolean, default: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
s.index({ course: 1, createdAt: -1 });
module.exports = mongoose.model("LMSAssignment", s);
