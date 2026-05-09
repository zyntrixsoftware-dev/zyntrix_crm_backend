// ── OTP PASSWORD RESET ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {

  const emailForm = document.getElementById("emailForm");
  const otpForm   = document.getElementById("otpForm");
  const resetForm = document.getElementById("resetForm");
  const resultEl  = document.getElementById("result");
  const stepNote  = document.querySelector(".step-note");

  let resetToken = "";

  if (!emailForm || !otpForm || !resetForm) return;

  emailForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const submitBtn = emailForm.querySelector("button[type='submit']");

    resultEl.textContent = "";

    if (!email) {
      setResult("Please enter your email address.", "red");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setResult("Please enter a valid email address.", "red");
      return;
    }

    setResult("Sending OTP…", "gray");
    submitBtn.disabled = true;

    const res = await apiRequest("/auth/send-otp", "POST", { email });

    submitBtn.disabled = false;

    if (res.error) {
      setResult(res.msg || "Something went wrong. Please try again.", "red");
      return;
    }

    setResult("✅ OTP sent. Please check your email.", "green");
    showStep(2);
  });

  otpForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const email = document.getElementById("email").value.trim().toLowerCase();
    const otp = document.getElementById("otp").value.trim();
    const submitBtn = otpForm.querySelector("button[type='submit']");

    if (!otp) {
      setResult("Please enter the OTP sent to your email.", "red");
      return;
    }

    setResult("Verifying OTP…", "gray");
    submitBtn.disabled = true;

    const res = await apiRequest("/auth/verify-otp", "POST", { email, otp });

    submitBtn.disabled = false;

    if (res.error) {
      setResult(res.msg || "OTP verification failed.", "red");
      return;
    }

    resetToken = res.resetToken;
    setResult("✅ OTP verified. You can now reset your password.", "green");
    showStep(3);
  });

  resetForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const newPassword = document.getElementById("newPassword").value.trim();
    const submitBtn = resetForm.querySelector("button[type='submit']");

    if (!newPassword || newPassword.length < 8) {
      setResult("Password must be at least 8 characters.", "red");
      return;
    }

    setResult("Resetting password…", "gray");
    submitBtn.disabled = true;

    const res = await apiRequest("/auth/reset-password", "POST", {
      resetToken,
      newPassword
    });

    submitBtn.disabled = false;

    if (res.error) {
      setResult(res.msg || "Password reset failed.", "red");
      return;
    }

    setResult("✅ Password reset successful! You can now log in.", "green");
  });

  function showStep(step) {
    emailForm.classList.toggle("hidden", step !== 1);
    otpForm.classList.toggle("hidden", step !== 2);
    resetForm.classList.toggle("hidden", step !== 3);

    if (stepNote) {
      stepNote.textContent =
        step === 1 ? "Step 1 of 3: Enter your email" :
        step === 2 ? "Step 2 of 3: Enter OTP" :
        "Step 3 of 3: Set new password";
    }
  }

  function setResult(msg, color) {
    resultEl.style.color =
      color === "red" ? "var(--color-text-danger, crimson)" :
      color === "green" ? "var(--color-text-success, green)" :
      "var(--color-text-secondary, #666)";
    resultEl.textContent = msg;
  }
});
