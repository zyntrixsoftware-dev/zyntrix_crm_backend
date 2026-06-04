var DOCS = [
    { key:"tenthMarksheet",     label:"10th / SSC Marksheet",                 req:true },
    { key:"twelfthMarksheet",   label:"12th / HSC Marksheet",                 req:true },
    { key:"graduationCert",     label:"Graduation Certificate & Marksheet",   req:true },
    { key:"postGraduationCert", label:"Post Graduation Certificate",          req:false },
    { key:"otherCertifications",label:"Other Certifications",                 req:false },
    { key:"passportPhoto",      label:"Passport Size Photograph (colour)",    req:true },
    { key:"governmentId",       label:"Government ID — PAN / Voter ID / DL",   req:true },
    { key:"bankDetails",        label:"Bank Account Details (passbook / statement)", req:true },
    { key:"acceptanceLetter",   label:"Signed Offer Acceptance Letter",       req:false }
  ];

  function getToken(){
    var m = new URLSearchParams(window.location.search).get("token");
    return m ? m.trim() : "";
  }
  var TOKEN = getToken();

  function decodeEmail(t){
    try { var p = JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))); return p.email || ""; }
    catch(e){ return ""; }
  }

  if(!TOKEN){
    document.getElementById("gate").style.display = "block";
  } else {
    document.getElementById("formCard").style.display = "block";
    var em = decodeEmail(TOKEN);
    if(em) document.getElementById("whoEmail").textContent = em;

    var html = "";
    DOCS.forEach(function(d){
      html +=
        '<div class="doc">' +
          '<label>' + d.label + (d.req ? '<span class="req">*</span>' : '<span class="opt">(optional)</span>') + '</label>' +
          '<div class="file" id="file-' + d.key + '">' +
            '<div class="ic">📄</div>' +
            '<div class="txt" id="txt-' + d.key + '">Click to choose a file</div>' +
            '<input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*" data-key="' + d.key + '" />' +
          '</div>' +
        '</div>';
    });
    document.getElementById("docs").innerHTML = html;

    document.querySelectorAll('.file input[type="file"]').forEach(function(inp){
      inp.addEventListener("change", function(){
        var key = this.getAttribute("data-key");
        var box = document.getElementById("file-" + key);
        var txt = document.getElementById("txt-" + key);
        if(this.files.length){ txt.textContent = "✓ " + this.files[0].name; box.classList.add("filled"); }
        else { txt.textContent = "Click to choose a file"; box.classList.remove("filled"); }
      });
    });
  }

  function showMsg(type, text){
    var m = document.getElementById("msg");
    m.className = "msg show " + type;
    m.innerHTML = text;
  }

  var form = document.getElementById("docForm");
  if(form){
    form.addEventListener("submit", async function(e){
      e.preventDefault();
      var btn = document.getElementById("submitBtn");
      var inputs = document.querySelectorAll('.file input[type="file"]');
      var fd = new FormData();
      fd.append("token", TOKEN);
      var have = 0, missingReq = [];
      DOCS.forEach(function(d){
        var inp = document.querySelector('.file input[data-key="' + d.key + '"]');
        if(inp && inp.files[0]){ fd.append(d.key, inp.files[0]); have++; }
        else if(d.req){ missingReq.push(d.label); }
      });
      if(missingReq.length){ showMsg("error", "Please upload these required documents:<br>• " + missingReq.join("<br>• ")); return; }
      if(have === 0){ showMsg("error", "Please choose at least one document."); return; }

      btn.disabled = true; btn.textContent = "Uploading…";
      try{
        var resp = await fetch("/api/hr/onboarding/upload", { method:"POST", body: fd });
        var data = await resp.json();
        if(resp.ok && data.ok){
          document.getElementById("docForm").innerHTML =
            '<div style="text-align:center;padding:24px 8px">' +
              '<div style="font-size:46px;margin-bottom:12px">✅</div>' +
              '<h2 style="margin-bottom:8px">Documents submitted!</h2>' +
              '<p style="color:var(--muted);line-height:1.7">Thank you' + (data.candidateName ? ', <b style="color:var(--text)">' + data.candidateName + '</b>' : '') + '. We received <b style="color:var(--text)">' + data.documentsStored + '</b> document(s). Our HR team will verify them and get back to you with the next steps.</p>' +
            '</div>';
        } else {
          showMsg("error", (data && data.error) ? data.error : "Upload failed. Please try again.");
          btn.disabled = false; btn.textContent = "Submit Documents";
        }
      } catch(err){
        showMsg("error", "Could not reach the server. Please check your connection and try again.");
        btn.disabled = false; btn.textContent = "Submit Documents";
      }
    });
  }
