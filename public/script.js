// ===============================
// GLOBAL
// ===============================
let token = localStorage.getItem("token") || "";
let role = localStorage.getItem("role") || "";
let autoRules = []; // danh sách rule AutoMode

// ===============================
// AUTH FETCH
// ===============================
async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers["Content-Type"] = "application/json";
  if (token) options.headers["Authorization"] = "Bearer " + token;
  return fetch(url, options);
}

// ===============================
// LOGIN
// ===============================
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

// ===============================
// LOAD SENSOR
// ===============================
async function loadSensors() {
  const res = await fetch("/api/cambien/latest");
  const data = await res.json();
  if (!data) return;

  document.getElementById("temp").innerText = data.nhietdo ?? "--";
  document.getElementById("hum").innerText = data.doam ?? "--";
  document.getElementById("lux").innerText = data.anhSang ?? "--";
}

// ===============================
// LOAD STATUS
// ===============================
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

// ===============================
// SEND COMMAND
// ===============================
async function sendCmd(topic, cmd) {
  await authFetch("/api/cmd", {
    method: "POST",
    body: JSON.stringify({ topic, cmd })
  });
}

// ===============================
// LED + FAN CONTROL
// ===============================
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

// ===============================
// CURTAIN CONTROL
// ===============================
function curtainCmd(cmd) {
  sendCmd("truong/home/cmd/curtain", cmd);
}

// ===============================
// AUTO MODE – RULE TABLE
// ===============================
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

// ===============================
// LOAD AUTO CONFIG
// ===============================
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

  autoRules = cfg.autoDevices || [];
  renderAutoRuleTable();
}

// ===============================
// SAVE AUTO CONFIG
// ===============================
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

    autoMode: true,
    autoDevices: autoRules
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

// ===============================
// SCHEDULE
// ===============================
async function addSchedule() {
  const body = {
    device: document.getElementById("sch-device").value,
    action: document.getElementById("sch-action").value,
    time: document.getElementById("sch-time").value,
    repeat: document.getElementById("sch-repeat").value
  };

  const res = await authFetch("/api/schedule", {
    method: "POST",
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!data.success) {
    alert(data.error);
    return;
  }

  loadSchedule();
}

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

async function deleteSchedule(id) {
  await authFetch("/api/schedule/" + id, { method: "DELETE" });
  loadSchedule();
}

// ===============================
// SCENARIO
// ===============================
async function addScenario() {
  const body = {
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
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!data.success) {
    alert(data.error);
    return;
  }

  loadScenario();
}

async function loadScenario() {
  const res = await authFetch("/api/scenario");
  const list = await res.json();

  const tbody = document.querySelector("#scenarioTable tbody");
  tbody.innerHTML = "";

  list.forEach(s => {
    tbody.innerHTML += `
      <tr>
        <td>${s.name}</td>
        <td>
          ${JSON.stringify(s.condition)}
        </td>
        <td>
          ${s.actions.map(a => `${a.device}:${a.cmd}`).join(", ")}
        </td>
        <td><button onclick="deleteScenario('${s._id}')">Xóa</button></td>
      </tr>
    `;
  });
}

async function deleteScenario(id) {
  await authFetch("/api/scenario/" + id, { method: "DELETE" });
  loadScenario();
}

// ===============================
// AUTO LOG
// ===============================
async function loadAutoLog() {
  const res = await authFetch("/api/auto-log/latest");
  const logs = await res.json();

  const tbody = document.querySelector("#autoLogTable tbody");
  tbody.innerHTML = "";

  logs.forEach(l => {
    tbody.innerHTML += `
      <tr>
        <td>${new Date(l.timestamp).toLocaleString()}</td>
        <td>${l.rule}</td>
        <td>${l.action}</td>
        <td>${l.value}</td>
      </tr>
    `;
  });
}

// ===============================
// HISTORY TABLE
// ===============================
async function loadHistory() {
  const res = await fetch("/api/cambien/recent");
  const list = await res.json();

  const tbody = document.querySelector("#historyTable tbody");
  tbody.innerHTML = "";

  list.forEach(r => {
    tbody.innerHTML += `
      <tr>
        <td>${new Date(r.createdAt).toLocaleString()}</td>
        <td>${r.nhietdo}</td>
        <td>${r.doam}</td>
        <td>${r.anhSang}</td>
      </tr>
    `;
  });
}

// ===============================
// REFRESH (KHÔNG LOAD AUTOCONFIG)
// ===============================
function refreshAll() {
  loadSensors();
  loadStatus();
  loadAutoLog();
  loadHistory();
  updateCharts();
}

setInterval(refreshAll, 3000);
// ===============================
// GLOBAL
// ===============================
let token = localStorage.getItem("token") || "";
let role = localStorage.getItem("role") || "";
let autoRules = []; // danh sách rule AutoMode

// ===============================
// AUTH FETCH
// ===============================
async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers["Content-Type"] = "application/json";
  if (token) options.headers["Authorization"] = "Bearer " + token;
  return fetch(url, options);
}

// ===============================
// LOGIN
// ===============================
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

// ===============================
// LOAD SENSOR
// ===============================
async function loadSensors() {
  const res = await fetch("/api/cambien/latest");
  const data = await res.json();
  if (!data) return;

  document.getElementById("temp").innerText = data.nhietdo ?? "--";
  document.getElementById("hum").innerText = data.doam ?? "--";
  document.getElementById("lux").innerText = data.anhSang ?? "--";
}

// ===============================
// LOAD STATUS
// ===============================
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

// ===============================
// SEND COMMAND
// ===============================
async function sendCmd(topic, cmd) {
  await authFetch("/api/cmd", {
    method: "POST",
    body: JSON.stringify({ topic, cmd })
  });
}

// ===============================
// LED + FAN CONTROL
// ===============================
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

// ===============================
// CURTAIN CONTROL
// ===============================
function curtainCmd(cmd) {
  sendCmd("truong/home/cmd/curtain", cmd);
}

// ===============================
// AUTO MODE – RULE TABLE
// ===============================
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

// ===============================
// LOAD AUTO CONFIG
// ===============================
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

  autoRules = cfg.autoDevices || [];
  renderAutoRuleTable();
}

// ===============================
// SAVE AUTO CONFIG
// ===============================
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

    autoMode: true,
    autoDevices: autoRules
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

// ===============================
// SCHEDULE
// ===============================
async function addSchedule() {
  const body = {
    device: document.getElementById("sch-device").value,
    action: document.getElementById("sch-action").value,
    time: document.getElementById("sch-time").value,
    repeat: document.getElementById("sch-repeat").value
  };

  const res = await authFetch("/api/schedule", {
    method: "POST",
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!data.success) {
    alert(data.error);
    return;
  }

  loadSchedule();
}

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

async function deleteSchedule(id) {
  await authFetch("/api/schedule/" + id, { method: "DELETE" });
  loadSchedule();
}

// ===============================
// SCENARIO
// ===============================
async function addScenario() {
  const body = {
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
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!data.success) {
    alert(data.error);
    return;
  }

  loadScenario();
}

async function loadScenario() {
  const res = await authFetch("/api/scenario");
  const list = await res.json();

  const tbody = document.querySelector("#scenarioTable tbody");
  tbody.innerHTML = "";

  list.forEach(s => {
    tbody.innerHTML += `
      <tr>
        <td>${s.name}</td>
        <td>
          ${JSON.stringify(s.condition)}
        </td>
        <td>
          ${s.actions.map(a => `${a.device}:${a.cmd}`).join(", ")}
        </td>
        <td><button onclick="deleteScenario('${s._id}')">Xóa</button></td>
      </tr>
    `;
  });
}

async function deleteScenario(id) {
  await authFetch("/api/scenario/" + id, { method: "DELETE" });
  loadScenario();
}

// ===============================
// AUTO LOG
// ===============================
async function loadAutoLog() {
  const res = await authFetch("/api/auto-log/latest");
  const logs = await res.json();

  const tbody = document.querySelector("#autoLogTable tbody");
  tbody.innerHTML = "";

  logs.forEach(l => {
    tbody.innerHTML += `
      <tr>
        <td>${new Date(l.timestamp).toLocaleString()}</td>
        <td>${l.rule}</td>
        <td>${l.action}</td>
        <td>${l.value}</td>
      </tr>
    `;
  });
}

// ===============================
// HISTORY TABLE
// ===============================
async function loadHistory() {
  const res = await fetch("/api/cambien/recent");
  const list = await res.json();

  const tbody = document.querySelector("#historyTable tbody");
  tbody.innerHTML = "";

  list.forEach(r => {
    tbody.innerHTML += `
      <tr>
        <td>${new Date(r.createdAt).toLocaleString()}</td>
        <td>${r.nhietdo}</td>
        <td>${r.doam}</td>
        <td>${r.anhSang}</td>
      </tr>
    `;
  });
}

// ===============================
// REFRESH (KHÔNG LOAD AUTOCONFIG)
// ===============================
function refreshAll() {
  loadSensors();
  loadStatus();
  loadAutoLog();
  loadHistory();
  updateCharts();
}

setInterval(refreshAll, 3000);
// ===============================
// BIỂU ĐỒ KIỂU CŨ + BỘ LỌC THỜI GIAN
// ===============================
let chartTemp, chartHum, chartLux;

function createCharts() {
  const ctxTemp = document.getElementById("chartTemp").getContext("2d");
  const ctxHum  = document.getElementById("chartHum").getContext("2d");
  const ctxLux  = document.getElementById("chartLux").getContext("2d");

  chartTemp = new Chart(ctxTemp, {
    type: "line",
    data: { labels: [], datasets: [{
      label: "Nhiệt độ (°C)",
      data: [],
      borderColor: "#ff4d4d",
      borderWidth: 2,
      tension: 0,
      fill: false
    }]},
    options: { responsive: true }
  });

  chartHum = new Chart(ctxHum, {
    type: "line",
    data: { labels: [], datasets: [{
      label: "Độ ẩm (%)",
      data: [],
      borderColor: "#4da6ff",
      borderWidth: 2,
      tension: 0,
      fill: false
    }]},
    options: { responsive: true }
  });

  chartLux = new Chart(ctxLux, {
    type: "line",
    data: { labels: [], datasets: [{
      label: "Ánh sáng (lux)",
      data: [],
      borderColor: "#ffd24d",
      borderWidth: 2,
      tension: 0,
      fill: false
    }]},
    options: { responsive: true }
  });
}

async function loadChartData() {
  const mode = document.getElementById("chart-mode").value;
  const from = document.getElementById("from-date").value;
  const to   = document.getElementById("to-date").value;

  if (!from || !to) {
    alert("Vui lòng chọn khoảng thời gian");
    return;
  }

  const res = await fetch(`/api/cambien/stats?mode=${mode}&from=${from}&to=${to}`);
  const list = await res.json();

  const labels = list.map(i => {
    if (mode === "day")   return `${i._id.d}/${i._id.m}/${i._id.y}`;
    if (mode === "month") return `${i._id.m}/${i._id.y}`;
    if (mode === "year")  return `${i._id.y}`;
  });

  chartTemp.data.labels = labels;
  chartTemp.data.datasets[0].data = list.map(i => i.temp);
  chartTemp.update();

  chartHum.data.labels = labels;
  chartHum.data.datasets[0].data = list.map(i => i.hum);
  chartHum.update();

  chartLux.data.labels = labels;
  chartLux.data.datasets[0].data = list.map(i => i.lux);
  chartLux.update();
}

// ===============================
// INIT
// ===============================
window.onload = () => {
  if (token) {
    loadSensors();
    loadStatus();
    loadAutoConfig();
    loadSchedule();
    loadScenario();
    loadAutoLog();
    loadHistory();

    createCharts();
    updateCharts();
  }
};
// ===============================
// INIT
// ===============================
window.onload = () => {
  if (token) {
    loadSensors();
    loadStatus();
    loadAutoConfig();
    loadSchedule();
    loadScenario();
    loadAutoLog();
    loadHistory();

    createCharts();
  }
};
