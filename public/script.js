let tempChart, humChart, luxChart;
let latestStatus = null;
let token = null;
let role = null;
let username = null;

// ===============================
//  AUTH & FETCH WRAPPER
// ===============================
function initAuth() {
  token = localStorage.getItem("token");
  role = localStorage.getItem("role");
  username = localStorage.getItem("username");

  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  const infoEl = document.getElementById("user-info");
  if (infoEl) {
    infoEl.innerText = `Đăng nhập: ${username || "unknown"} (${role || "user"})`;
  }
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("username");
  window.location.href = "/login.html";
}

async function authFetch(url, options = {}) {
  if (!token) initAuth();
  const headers = options.headers || {};
  headers["Authorization"] = "Bearer " + token;
  if (!headers["Content-Type"] && options.body) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(url, { ...options, headers });
}

// ===============================
//  ĐỒNG HỒ REALTIME
// ===============================
function updateClock() {
  const now = new Date();
  document.getElementById("clock").innerText =
    now.toLocaleString("vi-VN");
}
setInterval(updateClock, 1000);
updateClock();

// ===============================
//  TẠO BIỂU ĐỒ
// ===============================
function createCharts() {
  const ctxT = document.getElementById("chartTemp");
  const ctxH = document.getElementById("chartHum");
  const ctxL = document.getElementById("chartLux");

  tempChart = new Chart(ctxT, {
    type: "line",
    data: { labels: [], datasets: [{
      label: "Nhiệt độ (°C)",
      data: [],
      borderColor: "rgba(239,68,68,0.9)",
      backgroundColor: "rgba(239,68,68,0.15)",
      tension: 0.3
    }]},
    options: { responsive: true }
  });

  humChart = new Chart(ctxH, {
    type: "line",
    data: { labels: [], datasets: [{
      label: "Độ ẩm (%)",
      data: [],
      borderColor: "rgba(56,189,248,0.9)",
      backgroundColor: "rgba(56,189,248,0.15)",
      tension: 0.3
    }]},
    options: { responsive: true }
  });

  luxChart = new Chart(ctxL, {
    type: "line",
    data: { labels: [], datasets: [{
      label: "Ánh sáng (lux)",
      data: [],
      borderColor: "rgba(250,204,21,0.9)",
      backgroundColor: "rgba(250,204,21,0.15)",
      tension: 0.3
    }]},
    options: { responsive: true }
  });
}

function updateCharts(data) {
  const time = new Date().toLocaleTimeString();

  const charts = [tempChart, humChart, luxChart];
  charts.forEach(chart => chart.data.labels.push(time));

  tempChart.data.datasets[0].data.push(data.nhietdo);
  humChart.data.datasets[0].data.push(data.doam);
  luxChart.data.datasets[0].data.push(data.anhSang);

  if (tempChart.data.labels.length > 20) {
    charts.forEach(chart => {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    });
  }

  charts.forEach(chart => chart.update());
}

// ===============================
//  CẢM BIẾN & LỊCH SỬ
// ===============================
async function loadSensors() {
  const res = await fetch("/api/cambien/latest");
  const data = await res.json();
  if (!data || data.nhietdo === undefined) return;

  document.getElementById("temp").innerText = data.nhietdo + " °C";
  document.getElementById("hum").innerText = data.doam + " %";
  document.getElementById("lux").innerText = data.anhSang + " lux";

  updateCharts(data);
}

async function loadHistory() {
  const res = await fetch("/api/cambien/recent");
  const list = await res.json();

  const tbody = document.querySelector("#historyTable tbody");
  tbody.innerHTML = "";

  list.forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td>${new Date(item.createdAt).toLocaleString()}</td>
        <td>${item.nhietdo}</td>
        <td>${item.doam}</td>
        <td>${item.anhSang}</td>
      </tr>
    `;
  });
}

// ===============================
//  TRẠNG THÁI THIẾT BỊ
// ===============================
async function loadStatus() {
  const res = await fetch("/api/trangthai/latest");
  const data = await res.json();
  if (!data) return;

  latestStatus = data;
  const mapBool = v => v ? "Bật" : "Tắt";

  document.getElementById("st-led1").innerText = mapBool(data.led1);
  document.getElementById("st-led2").innerText = mapBool(data.led2);
  document.getElementById("st-led3").innerText = mapBool(data.led3);
  document.getElementById("st-led4").innerText = mapBool(data.led4);
  document.getElementById("st-fan").innerText  = mapBool(data.fan);

  let modeLabel = "--";
  if (data.curtainMode === 0) modeLabel = "Dừng";
  else if (data.curtainMode === 1) modeLabel = "Đóng";
  else if (data.curtainMode === 2) modeLabel = "Mở";

  document.getElementById("st-curtain").innerText = modeLabel;
  document.getElementById("curtain-mode-label").innerText = modeLabel;
  document.getElementById("curtain-percent").innerText =
    (data.curtainPercent ?? "--") + " %";

  document.getElementById("st-last").innerText =
    data.lastAction || "--";

  updateControlButtons();
}

function updateControlButtons() {
  if (!latestStatus) return;

  const setActive = (id, on) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (on) el.classList.add("active");
    else el.classList.remove("active");
  };

  setActive("btn-led1", latestStatus.led1);
  setActive("btn-led2", latestStatus.led2);
  setActive("btn-led3", latestStatus.led3);
  setActive("btn-led4", latestStatus.led4);
  setActive("btn-fan",  latestStatus.fan);

  const btnOpen  = document.getElementById("btn-cur-open");
  const btnClose = document.getElementById("btn-cur-close");

  btnOpen.disabled  = latestStatus.curtainMode === 2;
  btnClose.disabled = latestStatus.curtainMode === 1;
}

// ===============================
//  ĐIỀU KHIỂN THIẾT BỊ
// ===============================
async function toggleLed(name) {
  const newState = !latestStatus?.[name];

  await authFetch("/api/cmd", {
    method: "POST",
    body: JSON.stringify({
      topic: "truong/home/cmd/" + name,
      cmd: newState ? "ON" : "OFF"
    })
  });

  setTimeout(loadStatus, 300);
}

async function toggleFan() {
  const newState = !latestStatus?.fan;

  await authFetch("/api/cmd", {
    method: "POST",
    body: JSON.stringify({
      topic: "truong/home/cmd/fan",
      cmd: newState ? "ON" : "OFF"
    })
  });

  setTimeout(loadStatus, 300);
}

async function curtainCmd(cmd) {
  await authFetch("/api/cmd", {
    method: "POST",
    body: JSON.stringify({
      topic: "truong/home/cmd/curtain",
      cmd
    })
  });

  setTimeout(loadStatus, 400);
}

// ===============================
//  AUTO MODE (SERVER-BASED)
// ===============================
async function toggleAutoMode() {
  const res = await authFetch("/api/auto-config");
  const cfg = await res.json();

  const newState = !cfg?.autoMode;

  const body = {
    ...cfg,
    autoMode: newState
  };

  await authFetch("/api/auto-config", {
    method: "POST",
    body: JSON.stringify(body)
  });

  alert("Auto Mode: " + (newState ? "BẬT" : "TẮT"));
  loadAutoConfig();
}

async function saveAutoConfig() {
  if (role !== "admin") {
    alert("Chỉ admin mới được chỉnh cấu hình Auto");
    return;
  }

  const body = {
    tempMin: document.getElementById("tempMin").value,
    tempMax: document.getElementById("tempMax").value,
    lightMin: document.getElementById("lightMin").value,
    lightMax: document.getElementById("lightMax").value,
    humidityMin: document.getElementById("humMin").value,
    humidityMax: document.getElementById("humMax").value,
    activeFrom: document.getElementById("activeFrom").value,
    activeTo: document.getElementById("activeTo").value,
    autoFan: document.getElementById("autoFan").checked,
    autoCurtain: document.getElementById("autoCurtain").checked,
    autoLight: document.getElementById("autoLight").checked,
    autoMode: true
  };

  const res = await authFetch("/api/auto-config", {
    method: "POST",
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!data.success) {
    alert(data.error);
    return;
  }

  alert("Đã lưu cấu hình Auto Mode");
}

async function loadAutoConfig() {
  const res = await authFetch("/api/auto-config");
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
  document.getElementById("autoFan").checked = cfg.autoFan ?? false;
  document.getElementById("autoCurtain").checked = cfg.autoCurtain ?? false;
  document.getElementById("autoLight").checked = cfg.autoLight ?? false;

  document.getElementById("auto-mode-label").innerText =
    cfg.autoMode ? "ON" : "OFF";
}

// ===============================
//  AUTO MODE LOG
// ===============================
async function loadAutoLog() {
  const res = await authFetch("/api/auto-log/latest");
  const list = await res.json();

  const tbody = document.querySelector("#autoLogTable tbody");
  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4">Chưa có log</td></tr>`;
    return;
  }

  const latest = list[0];
  document.getElementById("auto-running").innerText =
    `${latest.rule} — ${latest.action} (${new Date(latest.timestamp).toLocaleTimeString()})`;

  list.forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td>${new Date(item.timestamp).toLocaleString()}</td>
        <td>${item.rule}</td>
        <td>${item.action}</td>
        <td>${item.value ?? "--"}</td>
      </tr>
    `;
  });
}

// ===============================
//  SCHEDULE UI
// ===============================
async function loadSchedule() {
  if (role !== "admin") {
    document.querySelector("#scheduleTable tbody").innerHTML =
      `<tr><td colspan="5">Chỉ admin xem được lịch</td></tr>`;
    return;
  }

  const res = await authFetch("/api/schedule");
  const list = await res.json();

  const tbody = document.querySelector("#scheduleTable tbody");
  tbody.innerHTML = "";

  list.forEach(item => {
    tbody.innerHTML += `
      <tr>
        <td>${item.device}</td>
        <td>${item.action}</td>
        <td>${item.time}</td>
        <td>${item.repeat}</td>
        <td><button class="ctrl-btn" onclick="deleteSchedule('${item._id}')">Xóa</button></td>
      </tr>
    `;
  });
}

async function addSchedule() {
  if (role !== "admin") {
    alert("Chỉ admin mới được thêm lịch");
    return;
  }

  const device = document.getElementById("sch-device").value;
  const action = document.getElementById("sch-action").value;
  const time   = document.getElementById("sch-time").value;
  const repeat = document.getElementById("sch-repeat").value;

  if (!time) {
    alert("Vui lòng chọn thời gian");
    return;
  }

  await authFetch("/api/schedule", {
    method: "POST",
    body: JSON.stringify({ device, action, time, repeat })
  });

  alert("Đã thêm lịch");
  loadSchedule();
}

async function deleteSchedule(id) {
  if (!confirm("Xóa lịch này?")) return;

  await authFetch("/api/schedule/" + id, {
    method: "DELETE"
  });

  loadSchedule();
}

// ===============================
//  SCENARIO UI
// ===============================
async function loadScenario() {
  if (role !== "admin") {
    document.querySelector("#scenarioTable tbody").innerHTML =
      `<tr><td colspan="4">Chỉ admin xem được kịch bản</td></tr>`;
    return;
  }

  const res = await authFetch("/api/scenario");
  const list = await res.json();

  const tbody = document.querySelector("#scenarioTable tbody");
  tbody.innerHTML = "";

  list.forEach(item => {
    const condParts = [];
    if (item.condition?.tempAbove != null) condParts.push(`Temp > ${item.condition.tempAbove}`);
    if (item.condition?.tempBelow != null) condParts.push(`Temp < ${item.condition.tempBelow}`);
    if (item.condition?.lightAbove != null) condParts.push(`Light > ${item.condition.lightAbove}`);
    if (item.condition?.lightBelow != null) condParts.push(`Light < ${item.condition.lightBelow}`);
    if (item.condition?.humidityAbove != null) condParts.push(`Hum > ${item.condition.humidityAbove}`);
    if (item.condition?.humidityBelow != null) condParts.push(`Hum < ${item.condition.humidityBelow}`);

    const condStr = condParts.join(", ") || "Không";

    const acts = (item.actions || []).map(a => `${a.device}:${a.cmd}`).join(", ");

    tbody.innerHTML += `
      <tr>
        <td>${item.name}</td>
        <td>${condStr}</td>
        <td>${acts}</td>
        <td><button class="ctrl-btn" onclick="deleteScenario('${item._id}')">Xóa</button></td>
      </tr>
    `;
  });
}

async function addScenario() {
  if (role !== "admin") {
    alert("Chỉ admin mới được thêm kịch bản");
    return;
  }

  const name       = document.getElementById("sc-name").value.trim();
  const tempAbove  = document.getElementById("sc-tempAbove").value;
  const tempBelow  = document.getElementById("sc-tempBelow").value;
  const lightAbove = document.getElementById("sc-lightAbove").value;
  const lightBelow = document.getElementById("sc-lightBelow").value;
  const humAbove   = document.getElementById("sc-humAbove").value;
  const humBelow   = document.getElementById("sc-humBelow").value;
  const device     = document.getElementById("sc-device").value;
  const cmd        = document.getElementById("sc-cmd").value;

  if (!name) {
    alert("Nhập tên kịch bản");
    return;
  }

  const condition = {};
  if (tempAbove !== "") condition.tempAbove = Number(tempAbove);
  if (tempBelow !== "") condition.tempBelow = Number(tempBelow);
  if (lightAbove !== "") condition.lightAbove = Number(lightAbove);
  if (lightBelow !== "") condition.lightBelow = Number(lightBelow);
  if (humAbove !== "") condition.humidityAbove = Number(humAbove);
  if (humBelow !== "") condition.humidityBelow = Number(humBelow);

  const body = {
    name,
    condition,
    actions: [{ device, cmd }]
  };

  await authFetch("/api/scenario", {
    method: "POST",
    body: JSON.stringify(body)
  });

  alert("Đã thêm kịch bản");
  loadScenario();
}

async function deleteScenario(id) {
  if (!confirm("Xóa kịch bản này?")) return;

  await authFetch("/api/scenario/" + id, {
    method: "DELETE"
  });

  loadScenario();
}

// ===============================
//  REFRESH VÒNG LẶP
// ===============================
async function refreshAll() {
  loadSensors();
  loadStatus();
  loadHistory();
  loadSchedule();
  loadScenario();
  loadAutoConfig();
  loadAutoLog();
}

// ===============================
//  INIT
// ===============================
initAuth();
createCharts();
refreshAll();
setInterval(refreshAll, 3000);

