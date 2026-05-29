const mongoose = require("mongoose");

const DISCOUNT_TYPES = ["flat", "percent"];   // flat = ₹ off, percent = % off
const COUPON_TYPES   = ["promo", "scholarship", "referral", "staff"];

const couponSchema = new mongoose.Schema(
  {
    code:          { type: String, required: true, trim: true, uppercase: true, unique: true },
    description:   { type: String, default: "" },
    couponType:    { type: String, enum: COUPON_TYPES, default: "promo" },
    discountType:  { type: String, enum: DISCOUNT_TYPES, default: "flat" },
    discountValue: { type: Number, required: true, min: 0 },   // ₹ or %
    maxDiscount:   { type: Number, default: null },            // cap for percent coupons
    minOrderValue: { type: Number, default: 0 },               // minimum enrollment fee

    // Restrict to specific courses (empty = valid on all)
    applicableCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],

    maxUses:   { type: Number, default: null },   // null = unlimited
    usedCount: { type: Number, default: 0 },

    validFrom: { type: Date, default: Date.now },
    validTill: { type: Date, default: null },      // null = no expiry

    // Scholarship coupons require manager approval before use
    requiresApproval: { type: Boolean, default: false },

    isActive:  { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ isActive: 1, validTill: 1 });
couponSchema.index({ couponType: 1 });

// Virtual: is the coupon currently usable?
couponSchema.virtual("isValid").get(function () {
  const now = new Date();
  if (!this.isActive) return false;
  if (this.validTill && now > this.validTill) return false;
  if (this.maxUses !== null && this.usedCount >= this.maxUses) return false;
  return true;
});

// Helper: calculate discounted amount for a given fee
couponSchema.methods.calcDiscount = function (fee) {
  if (this.discountType === "flat") {
    return Math.min(this.discountValue, fee);
  }
  // percent
  const disc = (fee * this.discountValue) / 100;
  return this.maxDiscount ? Math.min(disc, this.maxDiscount) : disc;
};

couponSchema.statics.DISCOUNT_TYPES = DISCOUNT_TYPES;
couponSchema.statics.COUPON_TYPES   = COUPON_TYPES;

module.exports = mongoose.model("Coupon", couponSchema);
