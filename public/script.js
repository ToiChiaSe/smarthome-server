let tempChart, humChart, luxChart;
let latestStatus = null;

// ====== TẠO BIỂU ĐỒ ======
function createCharts() {
  const ctxT = document.getElementById("chartTemp");
  const ctxH = document.getElementById("chartHum");
  const ctxL = document.getElementById("chartLux");

  tempChart = new Chart(ctxT, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "Nhiệt độ (°C)",
        data: [],
        borderColor: "rgba(239,68,68,0.9)",
        backgroundColor: "rgba(239,68,68,0.15)",
        tension: 0.3
      }]
    },
    options: { responsive: true, scales: { y: { beginAtZero: false } } }
  });

  humChart = new Chart(ctxH, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "Độ ẩm (%)",
        data: [],
        borderColor: "rgba(56,189,248,0.9)",
        backgroundColor: "rgba(56,189,248,0.15)",
        tension: 0.3
      }]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });

  luxChart = new Chart(ctxL, {
    type: "line",
    data: {
      labels: [],
      datasets: [{
        label: "Ánh sáng (lux)",
        data: [],
        borderColor: "rgba(250,204,21,0.9)",
        backgroundColor: "rgba(250,204,21,0.15)",
        tension: 0.3
      }]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true } } }
  });
}

// ====== CẬP NHẬT BIỂU ĐỒ ======
function updateCharts(data) {
  const time = new Date().toLocaleTimeString();

  tempChart.data.labels.push(time);
  humChart.data.labels.push(time);
  luxChart.data.labels.push(time);

  tempChart.data.datasets[0].data.push(data.nhietdo);
  humChart.data.datasets[0].data.push(data.doam);
  luxChart.data.datasets[0].data.push(data.anhSang);

  if (tempChart.data.labels.length > 20) {
    tempChart.data.labels.shift();
    humChart.data.labels.shift();
    luxChart.data.labels.shift();

    tempChart.data.datasets[0].data.shift();
    humChart.data.datasets[0].data.shift();
    luxChart.data.datasets[0].data.shift();
  }

  tempChart.update();
  humChart.update();
  luxChart.update();
}

// ====== LỊCH SỬ 10 BẢN GHI ======
async function loadHistory() {
  const res = await fetch("/api/cambien/recent");
  const list = await res.json();

  const tbody = document.querySelector("#historyTable tbody");
  tbody.innerHTML = "";

  list.forEach(item => {
    const row = `
      <tr>
        <td>${new Date(item.createdAt).toLocaleString()}</td>
        <td>${item.nhietdo}</td>
        <td>${item.doam}</td>
        <td>${item.anhSang}</td>
      </tr>
    `;
    tbody.innerHTML += row;
  });
}

// ====== LOAD CẢM BIẾN ======
async function loadSensors() {
  const res = await fetch("/api/cambien/latest");
  const data = await res.json();
  if (!data || data.nhietdo === undefined) return;

  document.getElementById("temp").innerText = data.nhietdo + " °C";
  document.getElementById("hum").innerText = data.doam + " %";
  document.getElementById("lux").innerText = data.anhSang + " lux";

  updateCharts(data);
}

// ====== LOAD TRẠNG THÁI ======
async function loadStatus() {
  const res = await fetch("/api/trangthai/latest");
  const data = await res.json();
  if (!data) return;

  latestStatus = data;

  const mapBool = v => v ? "Bật" : "Tắt";

  document.getElementById("st-led1").innerText = mapBool(!!data.led1);
  document.getElementById("st-led2").innerText = mapBool(!!data.led2);
  document.getElementById("st-led3").innerText = mapBool(!!data.led3);
  document.getElementById("st-led4").innerText = mapBool(!!data.led4);
  document.getElementById("st-fan").innerText  = mapBool(!!data.fan);

  // Curtain
  let modeLabel = "--";
  if (data.curtainMode === 0) modeLabel = "Dừng";
  else if (data.curtainMode === 1) modeLabel = "Đóng";
  else if (data.curtainMode === 2) modeLabel = "Mở";

  document.getElementById("st-curtain").innerText       = modeLabel;
  document.getElementById("curtain-mode-label").innerText = modeLabel;
  document.getElementById("curtain-percent").innerText  =
    (data.curtainPercent ?? "--") + " %";

  // Cập nhật trạng thái nút (màu active)
  updateControlButtons();
}

// ====== CẬP NHẬT MÀU / TRẠNG THÁI NÚT ======
function updateControlButtons() {
  if (!latestStatus) return;

  const setActive = (id, on) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (on) el.classList.add("active");
    else el.classList.remove("active");
  };

  setActive("btn-led1", !!latestStatus.led1);
  setActive("btn-led2", !!latestStatus.led2);
  setActive("btn-led3", !!latestStatus.led3);
  setActive("btn-led4", !!latestStatus.led4);
  setActive("btn-fan",  !!latestStatus.fan);

  // Với rèm, disable nút theo mode nếu muốn:
  const btnOpen  = document.getElementById("btn-cur-open");
  const btnClose = document.getElementById("btn-cur-close");
  const btnStop  = document.getElementById("btn-cur-stop");

  if (latestStatus.curtainMode === 2) { // đang mở
    btnOpen.disabled  = true;
    btnClose.disabled = false;
  } else if (latestStatus.curtainMode === 1) { // đang đóng
    btnOpen.disabled  = false;
    btnClose.disabled = true;
  } else { // dừng
    btnOpen.disabled  = false;
    btnClose.disabled = false;
  }
}

// ====== GỬI LỆNH LED ======
async function toggleLed(name) {
  if (!latestStatus) await loadStatus();

  const current = latestStatus?.[name] || false;
  const newState = !current;

  await fetch("/api/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "truong/home/cmd/" + name,
      cmd: newState ? "ON" : "OFF"
    })
  });

  setTimeout(loadStatus, 400);
}

// ====== GỬI LỆNH QUẠT ======
async function toggleFan() {
  if (!latestStatus) await loadStatus();
  const current = latestStatus?.fan || false;
  const newState = !current;

  await fetch("/api/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "truong/home/cmd/fan",
      cmd: newState ? "ON" : "OFF"
    })
  });

  setTimeout(loadStatus, 400);
}

// ====== GỬI LỆNH RÈM ======
async function curtainCmd(cmd) {
  await fetch("/api/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: "truong/home/cmd/curtain",
      cmd
    })
  });

  setTimeout(loadStatus, 500);
}

// ====== VÒNG LẶP REFRESH ======
async function refreshAll() {
  loadSensors();
  loadStatus();
  loadHistory();
}

createCharts();
refreshAll();
setInterval(refreshAll, 3000);

