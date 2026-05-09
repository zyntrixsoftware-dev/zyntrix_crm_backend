const payrollMonth = document.getElementById("payrollMonth");
const loadPayrollBtn = document.getElementById("loadPayrollBtn");
const downloadPayslipBtn = document.getElementById("downloadPayslipBtn");

const totalHours = document.getElementById("totalHours");
const overtimeHours = document.getElementById("overtimeHours");
const grossPay = document.getElementById("grossPay");
const netPay = document.getElementById("netPay");
const salaryBreakdown = document.getElementById("salaryBreakdown");
const paymentStatus = document.getElementById("paymentStatus");
const payrollHistory = document.getElementById("payrollHistory");

let currentPayroll = null;

function money(value) {
  return `INR ${Number(value || 0).toFixed(2)}`;
}

function hoursFromMinutes(minutes) {
  return (Number(minutes || 0) / 60).toFixed(2);
}

function setDefaultMonth() {
  payrollMonth.value = new Date().toISOString().slice(0, 7);
}

function renderBreakdown(payroll) {
  salaryBreakdown.innerHTML = `
    <tr><td>Basic Pay</td><td>${money(payroll.basicPay)}</td></tr>
    <tr><td>HRA</td><td>${money(payroll.hra)}</td></tr>
    <tr><td>Bonus</td><td>${money(payroll.bonus)}</td></tr>
    <tr><td>Overtime Pay</td><td>${money(payroll.overtimePay)}</td></tr>
    <tr><td>Tax</td><td>- ${money(payroll.tax)}</td></tr>
    <tr><td>Penalties</td><td>- ${money(payroll.penalties)}</td></tr>
    <tr><td>Total Deductions</td><td>- ${money(payroll.deductions)}</td></tr>
  `;
}

function renderSummary(payroll) {
  totalHours.textContent = hoursFromMinutes(payroll.totalWorkedMinutes);
  overtimeHours.textContent = hoursFromMinutes(payroll.overtimeMinutes);
  grossPay.textContent = money(payroll.grossPay);
  netPay.textContent = money(payroll.netPay);
  paymentStatus.textContent = `Payment Status: ${payroll.paymentStatus.toUpperCase()}`;
  renderBreakdown(payroll);
}

function renderHistory(rows) {
  payrollHistory.innerHTML = "";

  if (!Array.isArray(rows) || !rows.length) {
    payrollHistory.innerHTML = '<tr><td colspan="5">No payroll history found.</td></tr>';
    return;
  }

  rows.forEach((item) => {
    payrollHistory.innerHTML += `
      <tr>
        <td>${item.month}</td>
        <td>${hoursFromMinutes(item.totalWorkedMinutes)}</td>
        <td>${hoursFromMinutes(item.overtimeMinutes)}</td>
        <td>${money(item.netPay)}</td>
        <td>${item.paymentStatus}</td>
      </tr>
    `;
  });
}

async function loadPayroll() {
  const month = payrollMonth.value;
  if (!month) return;

  const res = await apiRequest(`/payroll/my?month=${month}`);
  if (res.error || !res.payroll) {
    alert(res.msg || "Unable to load payroll");
    return;
  }

  currentPayroll = res.payroll;
  renderSummary(currentPayroll);
}

async function loadHistory() {
  const res = await apiRequest("/payroll/history");
  if (res.error) {
    payrollHistory.innerHTML = `<tr><td colspan="5">${res.msg || "Unable to load history"}</td></tr>`;
    return;
  }

  renderHistory(res);
}

function downloadPayslip() {
  if (!currentPayroll) {
    alert("Load payroll summary first.");
    return;
  }

  const user = JSON.parse(localStorage.getItem("user")) || {};

  const slip = [
    "Zyntrix Payroll Payslip",
    `Employee: ${user.name || "N/A"}`,
    `Email: ${user.email || "N/A"}`,
    `Month: ${currentPayroll.month}`,
    "",
    `Total Hours: ${hoursFromMinutes(currentPayroll.totalWorkedMinutes)}`,
    `Overtime Hours: ${hoursFromMinutes(currentPayroll.overtimeMinutes)}`,
    `Basic Pay: ${money(currentPayroll.basicPay)}`,
    `HRA: ${money(currentPayroll.hra)}`,
    `Bonus: ${money(currentPayroll.bonus)}`,
    `Overtime Pay: ${money(currentPayroll.overtimePay)}`,
    `Gross Pay: ${money(currentPayroll.grossPay)}`,
    `Tax: ${money(currentPayroll.tax)}`,
    `Penalties: ${money(currentPayroll.penalties)}`,
    `Deductions: ${money(currentPayroll.deductions)}`,
    `Net Pay: ${money(currentPayroll.netPay)}`,
    `Payment Status: ${currentPayroll.paymentStatus}`
  ].join("\n");

  const blob = new Blob([slip], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `payslip-${currentPayroll.month}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

loadPayrollBtn.addEventListener("click", loadPayroll);
downloadPayslipBtn.addEventListener("click", downloadPayslip);

setDefaultMonth();
loadPayroll();
loadHistory();
