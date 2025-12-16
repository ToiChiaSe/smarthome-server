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
  document.getElementById("humi").innerText = data.doam ?? "--";
  document.getElementById("light").innerText = data.anhSang ?? "--";
}

// ===============================
// LOAD STATUS
// ===============================
async function loadStatus() {
  const res = await fetch("/api/trangthai/latest");
  const st = await res.json();
  if (!st) return;

  document.getElementById("led1").checked = st.led1;
  document.getElementById("led2").checked = st.led2;
  document.getElementById("led3").checked = st.led3;
  document.getElementById("led4").checked = st.led4;
  document.getElementById("fan").checked = st.fan;

  document.getElementById("curtainMode").innerText =
    st.curtainMode === 1 ? "Đóng" :
    st.curtainMode === 2 ? "Mở" : "Dừng";
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
// REFRESH (KHÔNG LOAD AUTOCONFIG)
// ===============================
function refreshAll() {
  loadSensors();
  loadStatus();
}

setInterval(refreshAll, 3000);

// ===============================
// INIT
// ===============================
window.onload = () => {
  if (token) {
    loadSensors();
    loadStatus();
    loadAutoConfig();
  }
};
