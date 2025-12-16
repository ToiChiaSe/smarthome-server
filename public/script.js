/* ===============================
   GLOBAL
   =============================== */
let token = localStorage.getItem("token") || "";
let role = localStorage.getItem("role") || "";
let autoRules = []; // danh sách rule AutoMode

// Ngày thống kê (dd/mm/yyyy)
let statDate = new Date();

/* ===============================
   AUTH FETCH
   =============================== */
async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers["Content-Type"] = "application/json";
  if (token) options.headers["Authorization"] = "Bearer " + token;
  return fetch(url, options);
}

/* ===============================
   LOGIN
   =============================== */
async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (!data.token) {
    alert("Sai tài khoản hoặc mật khẩu");
    return;
  }

  token = data.token;
  role = data.role;
  localStorage.setItem("token", token);
  localStorage.setItem("role", role);

  window.location.reload();
}

/* ===============================
   LOAD SENSOR
   =============================== */
async function loadSensors() {
  const res = await fetch("/api/cambien/latest");
  const data = await res.json();
  if (!data) return;

  document.getElementById("temp").innerText = data.nhietdo ?? "--";
  document.getElementById("hum").innerText = data.doam ?? "--";
  document.getElementById("lux").innerText = data.anhSang ?? "--";
}

/* ===============================
   LOAD STATUS
   =============================== */
async function loadStatus() {
  const res = await fetch("/api/trangthai/latest");
  const st = await res.json();
  if (!st) return;

  document.getElementById("st-led1").innerText = st.led1 ? "ON" : "OFF";
  document.getElementById("st-led2").innerText = st.led2 ? "ON" : "OFF";
  document.getElementById("st-led3").innerText = st.led3 ? "ON" : "OFF";
  document.getElementById("st-led4").innerText = st.led4 ? "ON" : "OFF";
  document.getElementById("st-fan").innerText = st.fan ? "ON" : "OFF";

  document.getElementById("st-curtain").innerText =
    st.curtainMode === 1 ? "Đóng" :
    st.curtainMode === 2 ? "Mở" : "Dừng";

  document.getElementById("auto-mode-label").innerText = st.autoMode ? "ON" : "OFF";
  document.getElementById("st-last").innerText = st.lastAction ?? "--";
}

/* ===============================
   SEND COMMAND
   =============================== */
async function sendCmd(topic, cmd) {
  await authFetch("/api/cmd", {
    method: "POST",
    body: JSON.stringify({ topic, cmd })
  });
}

/* ===============================
   LED + FAN CONTROL
   =============================== */
async function toggleLed(led) {
  const st = document.getElementById("st-" + led).innerText;
  const newState = st === "ON" ? "OFF" : "ON";
  sendCmd("truong/home/cmd/" + led, newState);
}

async function toggleFan() {
  const st = document.getElementById("st-fan").innerText;
  const newState = st === "ON" ? "OFF" : "ON";
  sendCmd("truong/home/cmd/fan", newState);
}

/* ===============================
   CURTAIN CONTROL
   =============================== */
function curtainCmd(cmd) {
  sendCmd("truong/home/cmd/curtain", cmd);
}

/* ===============================
   AUTO MODE – RULE TABLE
   =============================== */
function addAutoRule(rule = null) {
  const newRule = rule || {
    device: "fan",
    sensor: "temp",
    mode: "above",
    action: "ON"
  };

  autoRules.push(newRule);
  renderAutoRuleTable();
}

function deleteAutoRule(i) {
  autoRules.splice(i, 1);
  renderAutoRuleTable();
}

function renderAutoRuleTable() {
  const tbody = document.querySelector("#autoRuleTable tbody");
  tbody.innerHTML = "";

  autoRules.forEach((r, i) => {
    tbody.innerHTML += `
      <tr>
        <td>
          <select onchange="autoRules[${i}].device=this.value">
            <option value="fan" ${r.device==="fan"?"selected":""}>Quạt</option>
            <option value="curtain" ${r.device==="curtain"?"selected":""}>Rèm</option>
            <option value="led1" ${r.device==="led1"?"selected":""}>Đèn 1</option>
            <option value="led2" ${r.device==="led2"?"selected":""}>Đèn 2</option>
            <option value="led3" ${r.device==="led3"?"selected":""}>Đèn 3</option>
            <option value="led4" ${r.device==="led4"?"selected":""}>Đèn 4</option>
          </select>
        </td>

        <td>
          <select onchange="autoRules[${i}].sensor=this.value">
            <option value="temp" ${r.sensor==="temp"?"selected":""}>Nhiệt độ</option>
            <option value="light" ${r.sensor==="light"?"selected":""}>Ánh sáng</option>
            <option value="humidity" ${r.sensor==="humidity"?"selected":""}>Độ ẩm</option>
          </select>
        </td>

        <td>
          <select onchange="autoRules[${i}].mode=this.value">
            <option value="above" ${r.mode==="above"?"selected":""}>≥ Max</option>
            <option value="below" ${r.mode==="below"?"selected":""}>≤ Min</option>
          </select>
        </td>

        <td>
          <select onchange="autoRules[${i}].action=this.value">
            <option value="ON" ${r.action==="ON"?"selected":""}>Bật</option>
            <option value="OFF" ${r.action==="OFF"?"selected":""}>Tắt</option>
            <option value="OPEN" ${r.action==="OPEN"?"selected":""}>Mở rèm</option>
            <option value="CLOSE" ${r.action==="CLOSE"?"selected":""}>Đóng rèm</option>
            <option value="STOP" ${r.action==="STOP"?"selected":""}>Dừng rèm</option>
          </select>
        </td>

        <td>
          <button onclick="deleteAutoRule(${i})">Xóa</button>
        </td>
      </tr>
    `;
  });
}
/* ===============================
   AUTO MODE – LOAD & SAVE CONFIG
   =============================== */
async function loadAutoConfig() {
  const res = await fetch("/api/auto-config");
  const cfg = await res.json();
  if (!cfg) return;

  document.getElementById("tempMin").value = cfg.tempMin ?? "";
  document.getElementById("tempMax").value = cfg.tempMax ?? "";
  document.getElementById("lightMin").value = cfg.lightMin ?? "";
  document.getElementById("lightMax").value = cfg.lightMax ?? "";
  document.getElementById("humMin").value = cfg.humidityMin ?? "";
  document.getElementById("humMax").value = cfg.humidityMax ?? "";

  document.getElementById("activeFrom").value = cfg.activeFrom ?? "";
  document.getElementById("activeTo").value = cfg.activeTo ?? "";

  autoRules = cfg.autoDevices || [];
  renderAutoRuleTable();

  document.getElementById("auto-running").innerText =
    cfg.autoMode ? "Đang bật" : "Đang tắt";
}

async function saveAutoConfig() {
  const payload = {
    tempMin: document.getElementById("tempMin").value,
    tempMax: document.getElementById("tempMax").value,
    lightMin: document.getElementById("lightMin").value,
    lightMax: document.getElementById("lightMax").value,
    humidityMin: document.getElementById("humMin").value,
    humidityMax: document.getElementById("humMax").value,
    activeFrom: document.getElementById("activeFrom").value,
    activeTo: document.getElementById("activeTo").value,
    autoMode: true,
    autoDevices: autoRules
  };

  const res = await authFetch("/api/auto-config", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!data.success) {
    alert("Lỗi: " + data.error);
    return;
  }

  alert("Đã lưu cấu hình Auto Mode");
}

/* ===============================
   AUTO LOG
   =============================== */
async function loadAutoLog() {
  const res = await authFetch("/api/auto-log/latest");
  const logs = await res.json();

  const tbody = document.querySelector("#autoLogTable tbody");
  tbody.innerHTML = "";

  logs.forEach(l => {
    const t = new Date(l.timestamp).toLocaleString("vi-VN");
    tbody.innerHTML += `
      <tr>
        <td>${t}</td>
        <td>${l.rule}</td>
        <td>${l.action}</td>
        <td>${l.value ?? "--"}</td>
      </tr>
    `;
  });
}

/* ===============================
   SCHEDULE
   =============================== */
async function loadSchedule() {
  const res = await authFetch("/api/schedule");
  const list = await res.json();

  const tbody = document.querySelector("#scheduleTable tbody");
  tbody.innerHTML = "";

  list.forEach(s => {
    tbody.innerHTML += `
      <tr>
        <td>${s.device}</td>
        <td>${s.action}</td>
        <td>${s.time}</td>
        <td>${s.repeat}</td>
        <td><button onclick="deleteSchedule('${s._id}')">Xóa</button></td>
      </tr>
    `;
  });
}

async function addSchedule() {
  const payload = {
    device: document.getElementById("sch-device").value,
    action: document.getElementById("sch-action").value,
    time: document.getElementById("sch-time").value,
    repeat: document.getElementById("sch-repeat").value
  };

  const res = await authFetch("/api/schedule", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!data.success) {
    alert("Lỗi: " + data.error);
    return;
  }

  loadSchedule();
}

async function deleteSchedule(id) {
  await authFetch("/api/schedule/" + id, { method: "DELETE" });
  loadSchedule();
}

/* ===============================
   SCENARIO
   =============================== */
async function loadScenario() {
  const res = await authFetch("/api/scenario");
  const list = await res.json();

  const tbody = document.querySelector("#scenarioTable tbody");
  tbody.innerHTML = "";

  list.forEach(sc => {
    const c = sc.condition;
    const cond = `
      ${c.tempAbove ? `Temp > ${c.tempAbove}` : ""}
      ${c.tempBelow ? `Temp < ${c.tempBelow}` : ""}
      ${c.lightAbove ? `Light > ${c.lightAbove}` : ""}
      ${c.lightBelow ? `Light < ${c.lightBelow}` : ""}
      ${c.humidityAbove ? `Hum > ${c.humidityAbove}` : ""}
      ${c.humidityBelow ? `Hum < ${c.humidityBelow}` : ""}
    `;

    const acts = sc.actions.map(a => `${a.device}:${a.cmd}`).join(", ");

    tbody.innerHTML += `
      <tr>
        <td>${sc.name}</td>
        <td>${cond}</td>
        <td>${acts}</td>
        <td><button onclick="deleteScenario('${sc._id}')">Xóa</button></td>
      </tr>
    `;
  });
}

async function addScenario() {
  const payload = {
    name: document.getElementById("sc-name").value,
    condition: {
      tempAbove: Number(document.getElementById("sc-tempAbove").value) || null,
      tempBelow: Number(document.getElementById("sc-tempBelow").value) || null,
      lightAbove: Number(document.getElementById("sc-lightAbove").value) || null,
      lightBelow: Number(document.getElementById("sc-lightBelow").value) || null,
      humidityAbove: Number(document.getElementById("sc-humAbove").value) || null,
      humidityBelow: Number(document.getElementById("sc-humBelow").value) || null
    },
    actions: [
      {
        device: document.getElementById("sc-device").value,
        cmd: document.getElementById("sc-cmd").value
      }
    ]
  };

  const res = await authFetch("/api/scenario", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!data.success) {
    alert("Lỗi: " + data.error);
    return;
  }

  loadScenario();
}

async function deleteScenario(id) {
  await authFetch("/api/scenario/" + id, { method: "DELETE" });
  loadScenario();
}
/* ===============================
   BIỂU ĐỒ – CHART.JS
   =============================== */

let chartTemp = null;
let chartHum = null;
let chartLux = null;

function destroyCharts() {
  if (chartTemp) chartTemp.destroy();
  if (chartHum) chartHum.destroy();
  if (chartLux) chartLux.destroy();
}

function formatLabel(item, mode) {
  if (mode === "day") {
    return `${item._id.d}/${item._id.m}`;
  }
  if (mode === "month") {
    return `T${item._id.m}/${item._id.y}`;
  }
  if (mode === "year") {
    return `${item._id.y}`;
  }
  return "";
}

async function loadChartData() {
  const mode = document.getElementById("chart-mode").value;
  const from = document.getElementById("from-date").value;
  const to   = document.getElementById("to-date").value;

  if (!from || !to) {
    alert("Vui lòng chọn khoảng thời gian");
    return;
  }

  const url = `/api/cambien/stats?from=${from}&to=${to}&mode=${mode}`;
  const res = await fetch(url);
  const data = await res.json();

  const labels = data.map(item => formatLabel(item, mode));
  const temps  = data.map(item => item.temp?.toFixed(1) ?? null);
  const hums   = data.map(item => item.hum?.toFixed(1) ?? null);
  const luxs   = data.map(item => item.lux?.toFixed(1) ?? null);

  destroyCharts();

  /* NHIỆT ĐỘ */
  chartTemp = new Chart(document.getElementById("chartTemp"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Nhiệt độ (°C)",
        data: temps,
        borderColor: "red",
        backgroundColor: "rgba(255,0,0,0.2)",
        tension: 0.3
      }]
    }
  });

  /* ĐỘ ẨM */
  chartHum = new Chart(document.getElementById("chartHum"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Độ ẩm (%)",
        data: hums,
        borderColor: "blue",
        backgroundColor: "rgba(0,0,255,0.2)",
        tension: 0.3
      }]
    }
  });

  /* ÁNH SÁNG */
  chartLux = new Chart(document.getElementById("chartLux"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Ánh sáng (lux)",
        data: luxs,
        borderColor: "orange",
        backgroundColor: "rgba(255,165,0,0.2)",
        tension: 0.3
      }]
    }
  });
}
/* ===============================
   BÁO CÁO THỐNG KÊ – FORMAT NGÀY
   =============================== */

function formatDate_ddmmyyyy(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatDate_yyyymmdd(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${y}-${m}-${d}`;
}

/* ===============================
   BÁO CÁO THỐNG KÊ – CHUYỂN NGÀY
   =============================== */

function changeStatDate(step) {
  statDate.setDate(statDate.getDate() + step);
  document.getElementById("stat-date").innerText = formatDate_ddmmyyyy(statDate);
}

/* ===============================
   BÁO CÁO THỐNG KÊ – TẢI DỮ LIỆU
   =============================== */

let statData = [];      // toàn bộ dữ liệu trong ngày
let statPage = 1;       // trang hiện tại
const statPerPage = 10; // 10 dòng / trang

async function loadStatTable() {
  const ymd = formatDate_yyyymmdd(statDate);

  const res = await fetch(`/api/cambien/by-date?date=${ymd}`);
  statData = await res.json();

  statPage = 1;
  renderStatTable();
}

/* ===============================
   BÁO CÁO THỐNG KÊ – RENDER BẢNG
   =============================== */

function renderStatTable() {
  const tbody = document.querySelector("#statTable tbody");
  tbody.innerHTML = "";

  const total = statData.length;
  const totalPages = Math.max(1, Math.ceil(total / statPerPage));

  if (statPage > totalPages) statPage = totalPages;

  const start = (statPage - 1) * statPerPage;
  const end = start + statPerPage;

  const pageData = statData.slice(start, end);

  pageData.forEach(row => {
    const t = new Date(row.createdAt).toLocaleTimeString("vi-VN");
    tbody.innerHTML += `
      <tr>
        <td>${t}</td>
        <td>${row.nhietdo}</td>
        <td>${row.doam}</td>
        <td>${row.anhSang}</td>
      </tr>
    `;
  });

  renderStatPagination(totalPages);
}

/* ===============================
   BÁO CÁO THỐNG KÊ – PHÂN TRANG
   =============================== */

function renderStatPagination(totalPages) {
  const box = document.getElementById("stat-pagination");

  box.innerHTML = `
    <button onclick="goStatPage(1)">&lt;&lt;</button>
    <button onclick="goStatPage(statPage - 1)">&lt;</button>

    <span style="margin:0 10px;">
      Trang ${statPage} / ${totalPages}
    </span>

    <button onclick="goStatPage(statPage + 1)">&gt;</button>
    <button onclick="goStatPage(${totalPages})">&gt;&gt;</button>
  `;
}

function goStatPage(p) {
  const totalPages = Math.max(1, Math.ceil(statData.length / statPerPage));
  if (p < 1) p = 1;
  if (p > totalPages) p = totalPages;
  statPage = p;
  renderStatTable();
}
/* ===============================
   ĐỒNG HỒ THỜI GIAN THỰC
   =============================== */
function updateClock() {
  const now = new Date();
  const t = now.toLocaleString("vi-VN");
  document.getElementById("clock").innerText = t;
}
setInterval(updateClock, 1000);

/* ===============================
   LOGOUT
   =============================== */
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  window.location.reload();
}

/* ===============================
   KIỂM TRA TOKEN & QUYỀN
   =============================== */
function applyRoleUI() {
  const isAdmin = role === "admin";

  // Ẩn các phần chỉ admin được dùng
  if (!isAdmin) {
    document.querySelectorAll("#scheduleTable button").forEach(btn => btn.style.display = "none");
    document.querySelectorAll("#scenarioTable button").forEach(btn => btn.style.display = "none");
  }

  // Hiển thị tên user
  const userInfo = document.getElementById("user-info");
  if (token) {
    userInfo.innerText = `Đăng nhập: ${role}`;
  } else {
    userInfo.innerText = "Chưa đăng nhập";
  }
}

/* ===============================
   KHỞI ĐỘNG TRANG
   =============================== */
async function initPage() {
  updateClock();
  applyRoleUI();

  // Mặc định ngày thống kê = hôm nay
  document.getElementById("stat-date").innerText = formatDate_ddmmyyyy(statDate);

  // Load dữ liệu ban đầu
  loadSensors();
  loadStatus();
  loadAutoConfig();
  loadAutoLog();

  if (role === "admin") {
    loadSchedule();
    loadScenario();
  }

  // Cập nhật cảm biến mỗi 5 giây
  setInterval(loadSensors, 5000);
  setInterval(loadStatus, 5000);
  setInterval(loadAutoLog, 7000);
}
/* ===============================
   WINDOW ONLOAD
   =============================== */
window.onload = () => {
  if (!token) {
    alert("Vui lòng đăng nhập");
    window.location.href = "/login.html";
    return;
  }

  initPage();
};
