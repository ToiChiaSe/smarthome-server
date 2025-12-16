let tempChart, humChart, luxChart;
let latestStatus = null;

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

// ===============================
//  CẬP NHẬT BIỂU ĐỒ
// ===============================
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
//  LỊCH SỬ 10 BẢN GHI
// ===============================
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
//  LOAD CẢM BIẾN
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

// ===============================
//  LOAD TRẠNG THÁI THIẾT BỊ
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

  // Curtain
  let modeLabel = "--";
  if (data.curtainMode === 0) modeLabel = "Dừng";
  else if (data.curtainMode === 1) modeLabel = "Đóng";
  else if (data.curtainMode === 2) modeLabel = "Mở";

  document.getElementById("st-curtain").innerText = modeLabel;
  document.getElementById("curtain-mode-label").innerText = modeLabel;
  document.getElementById("curtain-percent").innerText =
    (data.curtainPercent ?? "--") + " %";

  // Auto Mode
  document.getElementById("auto-mode-label").innerText =
    data.autoMode ? "ON" : "OFF";

  // Last Action
  document.getElementById("st-last").innerText =
    data.lastAction || "--";

  updateControlButtons();
}

// ===============================
//  CẬP NHẬT MÀU NÚT
// ===============================
function updateControlButtons() {
  if (!latestStatus) return;

  const setActive = (id, on) => {
    const el = document.getElementById(id);
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
//  GỬI LỆNH LED
// ===============================
async function toggleLed(name) {
  const newState = !latestStatus[name];

  await fetch("/api/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "truong/home/cmd/" + name,
      cmd: newState ? "ON" : "OFF"
    })
  });

  setTimeout(loadStatus, 300);
}

// ===============================
//  GỬI LỆNH QUẠT
// ===============================
async function toggleFan() {
  const newState = !latestStatus.fan;

  await fetch("/api/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "truong/home/cmd/fan",
      cmd: newState ? "ON" : "OFF"
    })
  });

  setTimeout(loadStatus, 300);
}

// ===============================
//  GỬI LỆNH RÈM
// ===============================
async function curtainCmd(cmd) {
  await fetch("/api/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "truong/home/cmd/curtain",
      cmd
    })
  });

  setTimeout(loadStatus, 400);
}

// ===============================
// AUTO MODE — BẬT / TẮT
// ===============================
async function toggleAutoMode() {
  const current = latestStatus?.autoMode || false;
  const newState = !current;

  await fetch("/api/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "truong/home/cmd/auto",
      cmd: newState ? "ON" : "OFF"
    })
  });

  alert("Đã gửi lệnh Auto Mode: " + (newState ? "ON" : "OFF"));
  setTimeout(loadStatus, 400);
}

// ===============================
// AUTO MODE — LƯU CẤU HÌNH
// ===============================
async function saveAutoConfig() {
  const body = {
    tempMin: Number(document.getElementById("tempMin").value),
    tempMax: Number(document.getElementById("tempMax").value),
    lightMin: Number(document.getElementById("lightMin").value),
    lightMax: Number(document.getElementById("lightMax").value),
    humidityMin: Number(document.getElementById("humMin").value),
    humidityMax: Number(document.getElementById("humMax").value),
    autoMode: true
  };

  await fetch("/api/auto-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  alert("Đã lưu cấu hình Auto Mode");
}

// ===============================
// LOAD CẤU HÌNH AUTO MODE
// ===============================
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
}

// ===============================
//  VÒNG LẶP REFRESH
// ===============================
async function refreshAll() {
  loadSensors();
  loadStatus();
  loadHistory();
}

createCharts();
loadAutoConfig();
refreshAll();
setInterval(refreshAll, 3000);
