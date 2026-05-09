const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },

  password: {
    type: String,
    required: true
  },

  role: {
    type: String,
    enum: ["super_admin","hr","sales","marketing","lms","employee"],
    default: "employee"
  },

  // OTP-based password reset
  otpCode:       { type: String },   // hashed OTP stored in DB
  otpExpiry:     { type: Date },     // expires in 10 minutes
  otpVerified:   { type: Boolean, default: false }, // true after OTP verified
  otpResetToken: { type: String },   // short-lived token to allow password reset

}, {
  timestamps: true
});

module.exports = mongoose.model("User", userSchema);