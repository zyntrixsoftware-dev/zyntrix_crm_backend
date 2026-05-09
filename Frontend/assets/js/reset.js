// ── RESET PASSWORD ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {

  const form      = document.getElementById("resetForm");
  const resultEl  = document.getElementById("result");
  const tokenInput = document.getElementById("token");

  if (!form) return;

  // Auto-fill token from URL query parameter
  const params = new URLSearchParams(window.location.search);
  const rawToken = params.get("token");

  if (rawToken) {
    tokenInput.value = rawToken;
  } else {
    tokenInput.placeholder = "Invalid or missing token";
    setResult(resultEl, "⚠️ No reset token found. Please use the link from your email.", "red");
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const token       = tokenInput.value.trim();
    const newPassword = document.getElementById("password").value;
    const submitBtn   = form.querySelector("button[type='submit']");

    resultEl.textContent = "";

    if (!token) {
      setResult(resultEl, "Invalid reset link. Please use the link from your email.", "red");
      return;
    }

    // FIX: enforce min 8 chars + at least one digit (matches server policy)
    if (!newPassword || newPassword.length < 8) {
      setResult(resultEl, "Password must be at least 8 characters long.", "red");
      return;
    }
    if (!/\d/.test(newPassword)) {
      setResult(resultEl, "Password must contain at least one number.", "red");
      return;
    }

    setResult(resultEl, "Resetting password…", "gray");
    submitBtn.disabled = true;

    const res = await apiRequest("/auth/reset-password", "POST", { token, newPassword });

    submitBtn.disabled = false;

    if (res.error || !res.msg.includes("successful")) {
      setResult(resultEl, res.msg || "Failed to reset password. The link may have expired.", "red");
      return;
    }

    resultEl.style.color = "var(--color-text-success, green)";
    resultEl.innerHTML =
      "✅ " + res.msg + " &nbsp; <a href=\"../index.html\" style=\"color:inherit;font-weight:500;\">Login Now →</a>";
  });
});

function setResult(el, msg, color) {
  el.style.color = color === "red"   ? "var(--color-text-danger, crimson)" :
                   color === "green" ? "var(--color-text-success, green)" :
                   "var(--color-text-secondary, #666)";
  el.textContent = msg;
}
