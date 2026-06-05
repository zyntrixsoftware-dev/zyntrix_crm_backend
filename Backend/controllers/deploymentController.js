const Deployment     = require("../models/Deployment");
const DeploymentTeam = require("../models/DeploymentTeam");
const Orientation    = require("../models/Orientation");
const { notifyDeployed } = require("../utils/candidateEmails");
const User   = require("../models/user");
const bcrypt = require("bcryptjs");

function checkHrAccess(req, res) {
  if (!["hr", "super_admin"].includes(req.user.role)) {
    res.status(403).json({ msg: "Access denied" });
    return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
//  READY-TO-DEPLOY QUEUE
//  GET /api/hr/deployment/ready
//  Returns orientation records with status "completed" that have no deployment
//  record yet (or deployment status === "pending").
// ═══════════════════════════════════════════════════════════════════════════
exports.listReady = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    // All orientations that are completed
    const completed = await Orientation.find({ orientationStatus: "completed" })
      .select("_id candidateEmail candidateName position department joiningDate mentorName orientationStatus completedAt")
      .sort({ completedAt: -1 });

    // Orientation records already deployed (dedupe by record, not email —
    // two candidates can share an email but each orientation deploys once).
    const deployedOrIds = await Deployment.find({
      status: { $in: ["deployed", "on_hold", "transferred"] }
    }).distinct("orientationId");

    const deployedSet = new Set(deployedOrIds.filter(Boolean).map(id => String(id)));

    const ready = completed.filter(o => !deployedSet.has(String(o._id)));

    return res.json({ ready, total: ready.length });
  } catch (err) {
    console.error("DEPLOYMENT READY ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  LIST ALL DEPLOYMENTS
//  GET /api/hr/deployment
//  ?status=deployed|pending|on_hold|transferred|exited
//  ?teamId=<id>
//  ?search=<text>
// ═══════════════════════════════════════════════════════════════════════════
exports.list = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { status, teamId, search } = req.query;
    const query = {};
    if (status) query.status = status;
    if (teamId) query.teamId = teamId;
    if (search) {
      query.$or = [
        { candidateName:  { $regex: search, $options: "i" } },
        { candidateEmail: { $regex: search, $options: "i" } },
        { teamName:       { $regex: search, $options: "i" } },
        { roleInTeam:     { $regex: search, $options: "i" } },
        { department:     { $regex: search, $options: "i" } }
      ];
    }

    const deployments = await Deployment.find(query)
      .populate("teamId", "name department teamLead location officeLocation status")
      .populate("orientationId", "orientationStatus completedAt")
      .sort({ createdAt: -1 });

    // KPI stats
    const all = await Deployment.find({});
    const stats = {
      total:       all.length,
      deployed:    all.filter(d => d.status === "deployed").length,
      pending:     all.filter(d => d.status === "pending").length,
      on_hold:     all.filter(d => d.status === "on_hold").length,
      transferred: all.filter(d => d.status === "transferred").length,
    };

    // Ready to deploy count
    const completedOrientations = await Orientation.countDocuments({ orientationStatus: "completed" });
    const deployedOrCount = (await Deployment.find({ status: { $in: ["deployed", "on_hold", "transferred"] } }).distinct("orientationId")).filter(Boolean).length;
    stats.readyToDeploy = Math.max(0, completedOrientations - deployedOrCount);

    return res.json({ deployments, total: deployments.length, stats });
  } catch (err) {
    console.error("DEPLOYMENT LIST ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  GET ONE
//  GET /api/hr/deployment/:id
// ═══════════════════════════════════════════════════════════════════════════
exports.getOne = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const dep = await Deployment.findById(req.params.id)
      .populate("teamId", "name department teamLead teamLeadEmail location officeLocation")
      .populate("orientationId", "orientationStatus completedAt sessionIds taskChecklist");
    if (!dep) return res.status(404).json({ msg: "Deployment record not found" });
    return res.json({ deployment: dep });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  DEPLOY A CANDIDATE
//  POST /api/hr/deployment
//  body: { orientationId, candidateEmail, candidateName, position, department,
//          joiningDate, teamId, roleInTeam, reportingManager, workLocation,
//          officeLocation, shift, deployedDate, domainEmail, systemAccess,
//          deviceIssued, notes }
// ═══════════════════════════════════════════════════════════════════════════
exports.deploy = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const {
      orientationId, candidateEmail, candidateName, position, department,
      joiningDate, teamId, roleInTeam, reportingManager,
      workLocation, officeLocation, shift, deployedDate,
      domainEmail, systemAccess, deviceIssued, notes, employeeId
    } = req.body;

    if (!candidateEmail) return res.status(400).json({ msg: "candidateEmail is required" });
    if (!teamId)         return res.status(400).json({ msg: "teamId is required" });

    // Validate team exists
    const team = await DeploymentTeam.findById(teamId);
    if (!team) return res.status(404).json({ msg: "Team not found" });

    // Already deployed? Check by the orientation record (not email), so two
    // candidates sharing an email don't block each other.
    const existing = orientationId
      ? await Deployment.findOne({ orientationId, status: { $in: ["deployed", "on_hold"] } })
      : null;
    if (existing) return res.status(409).json({ msg: "This candidate is already deployed or on hold" });

    // Assign an employee ID — use the one provided, else auto-generate the next ZYN####.
    let empId = (employeeId || "").trim();
    if (!empId) {
      const existingIds = await Deployment.find({ employeeId: { $regex: /^ZYN\d+$/ } }).select("employeeId");
      const maxNum = existingIds.reduce((m, d) => Math.max(m, parseInt(d.employeeId.slice(3)) || 0), 1000);
      empId = "ZYN" + (maxNum + 1);
    }

    const dep = await Deployment.create({
      orientationId: orientationId || null,
      candidateEmail: candidateEmail.toLowerCase().trim(),
      candidateName:  candidateName  || "",
      employeeId:     empId,
      position:       position       || "",
      department:     department     || team.department || "",
      joiningDate:    joiningDate    || "",
      teamId:         team._id,
      teamName:       team.name,
      roleInTeam:     roleInTeam     || "",
      reportingManager: reportingManager || team.teamLead || "",
      workLocation:   workLocation   || "office",
      officeLocation: officeLocation || team.officeLocation || "",
      shift:          shift          || "morning",
      deployedDate:   deployedDate   || new Date().toISOString().slice(0, 10),
      domainEmail:    domainEmail    || "",
      systemAccess:   Array.isArray(systemAccess) ? systemAccess : [],
      deviceIssued:   deviceIssued   || "Pending",
      notes:          notes          || "",
      status:         "deployed",
      createdBy:      req.user.id
    });

    const populated = await Deployment.findById(dep._id)
      .populate("teamId", "name department teamLead teamLeadEmail location officeLocation");

    // Create / update the CRM login account so the employee can sign in at /crm/.
    // Login email = the assigned domain email; password is hashed (never stored plain).
    let loginInfo = null;
    const loginEmail = (domainEmail || "").trim().toLowerCase();
    const loginPassword = (req.body.loginPassword || "").trim();
    if (loginEmail && loginPassword) {
      try {
        const hash = await bcrypt.hash(loginPassword, 10);
        let user = await User.findOne({ email: loginEmail });
        if (user) {
          user.password = hash;
          if (candidateName) user.name = candidateName;
          if (user.role !== "super_admin") user.role = "employee";
          user.department    = department || (team && team.department) || user.department;
          user.designation   = roleInTeam || position || user.designation;
          user.dateOfJoining = joiningDate || user.dateOfJoining;
          user.active        = true;
          await user.save();
        } else {
          await User.create({
            name:          candidateName || "Employee",
            email:         loginEmail,
            password:      hash,
            role:          "employee",
            department:    department || (team && team.department) || "",
            designation:   roleInTeam || position || "",
            employeeType:  "Full-time",
            dateOfJoining: joiningDate || "",
          });
        }
        loginInfo = { email: loginEmail, password: loginPassword, url: "https://zyntrixsoftware.com/crm/" };
        console.log(`[deploy] CRM login account ready -> ${loginEmail}`);
      } catch (e) {
        console.error("[deploy] login account create failed:", e.message);
      }
    }

    // Send deployment email to candidate (fire-and-forget)
    notifyDeployed(populated, populated.teamId, loginInfo).then(result => {
      if (result.sent) {
        console.log(`[deploy] deployment email sent → ${populated.candidateEmail}`);
      } else {
        console.error(`[deploy] deployment email FAILED → ${populated.candidateEmail} | reason: ${result.reason}`);
      }
    }).catch(err =>
      console.error("[deploy] deployment email exception:", err.message)
    );

    return res.status(201).json({ msg: "Candidate deployed successfully", deployment: populated });
  } catch (err) {
    console.error("DEPLOY ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  UPDATE DEPLOYMENT
//  PATCH /api/hr/deployment/:id
// ═══════════════════════════════════════════════════════════════════════════
exports.update = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const dep = await Deployment.findById(req.params.id);
    if (!dep) return res.status(404).json({ msg: "Deployment not found" });

    // If team is being changed, re-validate and update teamName
    if (req.body.teamId && String(req.body.teamId) !== String(dep.teamId)) {
      const team = await DeploymentTeam.findById(req.body.teamId);
      if (!team) return res.status(404).json({ msg: "Team not found" });
      dep.teamId   = team._id;
      dep.teamName = team.name;
      if (!req.body.reportingManager) dep.reportingManager = team.teamLead || "";
      if (!req.body.officeLocation)   dep.officeLocation   = team.officeLocation || "";
    }

    const fields = [
      "candidateName", "position", "department", "joiningDate",
      "roleInTeam", "reportingManager", "workLocation", "officeLocation",
      "shift", "deployedDate", "domainEmail", "systemAccess",
      "deviceIssued", "status", "notes"
    ];
    fields.forEach(f => { if (req.body[f] !== undefined) dep[f] = req.body[f]; });

    await dep.save();
    const populated = await Deployment.findById(dep._id)
      .populate("teamId", "name department teamLead location officeLocation");

    return res.json({ msg: "Updated", deployment: populated });
  } catch (err) {
    console.error("UPDATE DEPLOYMENT ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  DELETE DEPLOYMENT
//  DELETE /api/hr/deployment/:id
// ═══════════════════════════════════════════════════════════════════════════
exports.remove = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const dep = await Deployment.findByIdAndDelete(req.params.id);
    if (!dep) return res.status(404).json({ msg: "Deployment not found" });
    return res.json({ msg: "Deployment record removed" });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  TEAMS — LIST
//  GET /api/hr/deployment/teams
// ═══════════════════════════════════════════════════════════════════════════
exports.listTeams = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const query = {};
    if (req.query.status)     query.status     = req.query.status;
    if (req.query.department) query.department = req.query.department;

    const teams = await DeploymentTeam.find(query)
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    // Enrich with member count from Deployment
    const deployedCounts = await Deployment.aggregate([
      { $match: { status: { $in: ["deployed", "on_hold"] } } },
      { $group: { _id: "$teamId", count: { $sum: 1 } } }
    ]);
    const countMap = {};
    deployedCounts.forEach(d => { countMap[String(d._id)] = d.count; });

    const enriched = teams.map(t => ({
      ...t.toObject(),
      memberCount: countMap[String(t._id)] || 0
    }));

    return res.json({ teams: enriched, total: enriched.length });
  } catch (err) {
    console.error("LIST TEAMS ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  TEAMS — CREATE
//  POST /api/hr/deployment/teams
// ═══════════════════════════════════════════════════════════════════════════
exports.createTeam = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const { name, department, description, teamLead, teamLeadEmail, location, officeLocation } = req.body;
    if (!name)       return res.status(400).json({ msg: "name is required" });
    if (!department) return res.status(400).json({ msg: "department is required" });

    const team = await DeploymentTeam.create({
      name, department, description: description || "",
      teamLead: teamLead || "", teamLeadEmail: teamLeadEmail || "",
      location: location || "office",
      officeLocation: officeLocation || "",
      createdBy: req.user.id
    });

    return res.status(201).json({ msg: "Team created", team });
  } catch (err) {
    console.error("CREATE TEAM ERROR:", err);
    return res.status(500).json({ msg: "Server error: " + err.message });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  TEAMS — UPDATE
//  PATCH /api/hr/deployment/teams/:tid
// ═══════════════════════════════════════════════════════════════════════════
exports.updateTeam = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    const allowed = ["name", "department", "description", "teamLead", "teamLeadEmail", "location", "officeLocation", "status"];
    const update  = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });

    const team = await DeploymentTeam.findByIdAndUpdate(
      req.params.tid, update, { new: true, runValidators: true }
    );
    if (!team) return res.status(404).json({ msg: "Team not found" });

    // If name changed, sync teamName in all active deployments
    if (update.name) {
      await Deployment.updateMany({ teamId: team._id }, { teamName: update.name });
    }

    return res.json({ msg: "Team updated", team });
  } catch (err) {
    console.error("UPDATE TEAM ERROR:", err);
    return res.status(500).json({ msg: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  TEAMS — DELETE
//  DELETE /api/hr/deployment/teams/:tid
// ═══════════════════════════════════════════════════════════════════════════
exports.deleteTeam = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;

    // Prevent delete if team has active members
    const activeCount = await Deployment.countDocuments({
      teamId: req.params.tid,
      status: { $in: ["deployed", "on_hold"] }
    });
    if (activeCount > 0) {
      return res.status(409).json({
        msg: `Cannot delete team — ${activeCount} active member(s). Reassign them first.`
      });
    }

    const team = await DeploymentTeam.findByIdAndDelete(req.params.tid);
    if (!team) return res.status(404).json({ msg: "Team not found" });
    return res.json({ msg: "Team deleted" });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
//  TEAM MEMBERS
//  GET /api/hr/deployment/teams/:tid/members
// ═══════════════════════════════════════════════════════════════════════════
exports.teamMembers = async (req, res) => {
  try {
    if (!checkHrAccess(req, res)) return;
    const members = await Deployment.find({
      teamId: req.params.tid,
      status: { $in: ["deployed", "on_hold"] }
    }).sort({ deployedDate: -1 });
    return res.json({ members, total: members.length });
  } catch (err) {
    return res.status(500).json({ msg: "Server error" });
  }
};
