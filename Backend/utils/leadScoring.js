/**
 * Lead Scoring Engine — ZyntrixCRM Sales System
 * 
 * Scores a StudentLead from 0–100 based on:
 *   - Source quality      (0–25 pts)
 *   - Budget alignment    (0–25 pts)
 *   - Pipeline stage      (0–25 pts)
 *   - Engagement recency  (0–25 pts)
 * 
 * Call `scoreLeadAndSave(leadId)` to compute + persist to the lead document.
 * The score is stored in lead.score (Number field we add to StudentLead schema).
 */

const mongoose = require("mongoose");

// Source quality weights (max 25)
const SOURCE_SCORE = {
  referral:     25,
  walk_in:      22,
  website:      18,
  social_media: 12,
  cold_call:    8,
  other:        5
};

// Pipeline stage progress (max 25) — higher stage = warmer lead
const STAGE_SCORE = {
  new_lead:       0,
  contacted:      5,
  demo_scheduled: 12,
  demo_attended:  20,
  enrolled:       25,
  dropped:        0,
  completed:      25
};

/**
 * Score a single lead object (does NOT query DB — pass the plain document/object).
 * Returns { total, breakdown }
 */
function computeScore(lead, coursePrice = 0) {
  let score = 0;
  const breakdown = {};

  // 1. Source (0–25)
  const sourceScore = SOURCE_SCORE[lead.source] ?? 5;
  score += sourceScore;
  breakdown.source = sourceScore;

  // 2. Budget alignment (0–25)
  //    If we know budget and course price, check alignment
  let budgetScore = 10; // default if unknown
  if (lead.budget && coursePrice) {
    const ratio = lead.budget / coursePrice;
    if (ratio >= 1.0)       budgetScore = 25;  // can fully afford
    else if (ratio >= 0.75) budgetScore = 20;
    else if (ratio >= 0.5)  budgetScore = 12;
    else if (ratio >= 0.25) budgetScore = 5;
    else                    budgetScore = 0;
  } else if (lead.budget > 0) {
    budgetScore = 10; // budget known but no course to compare
  }
  score += budgetScore;
  breakdown.budget = budgetScore;

  // 3. Pipeline stage progress (0–25)
  const stageScore = STAGE_SCORE[lead.pipelineStage] ?? 0;
  score += stageScore;
  breakdown.stage = stageScore;

  // 4. Engagement recency (0–25)
  //    Based on lastContactedAt — fresher = better
  let engagementScore = 0;
  if (lead.lastContactedAt) {
    const daysSince = (Date.now() - new Date(lead.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 1)       engagementScore = 25;
    else if (daysSince <= 3)  engagementScore = 20;
    else if (daysSince <= 7)  engagementScore = 14;
    else if (daysSince <= 14) engagementScore = 8;
    else if (daysSince <= 30) engagementScore = 3;
    else                      engagementScore = 0;
  }
  score += engagementScore;
  breakdown.engagement = engagementScore;

  return { total: Math.min(100, score), breakdown };
}

/**
 * Score a lead by ID and save the score back to the document.
 * Also saves scoreBreakdown for transparency.
 */
async function scoreLeadAndSave(leadId) {
  try {
    const StudentLead = require("../models/StudentLead");
    const Course      = require("../models/Course");

    const lead = await StudentLead.findById(leadId).lean();
    if (!lead) return null;

    let coursePrice = 0;
    if (lead.courseInterest) {
      const course = await Course.findById(lead.courseInterest, "price discountPrice").lean();
      coursePrice = course?.discountPrice || course?.price || 0;
    }

    const { total, breakdown } = computeScore(lead, coursePrice);

    await StudentLead.findByIdAndUpdate(leadId, {
      score: total,
      scoreBreakdown: breakdown,
      scoredAt: new Date()
    });

    return { score: total, breakdown };
  } catch (err) {
    console.error("[leadScoring] error:", err.message);
    return null;
  }
}

/**
 * Batch-score all unarchived leads.
 * Use sparingly — intended for a nightly job or manual trigger.
 */
async function scoreAllLeads() {
  const StudentLead = require("../models/StudentLead");
  const leads = await StudentLead.find({ isArchived: false }, "_id").lean();
  const results = await Promise.allSettled(leads.map(l => scoreLeadAndSave(l._id)));
  const ok  = results.filter(r => r.status === "fulfilled").length;
  const err = results.filter(r => r.status === "rejected").length;
  console.log(`[leadScoring] batch complete: ${ok} scored, ${err} errors`);
  return { ok, err, total: leads.length };
}

module.exports = { computeScore, scoreLeadAndSave, scoreAllLeads };
