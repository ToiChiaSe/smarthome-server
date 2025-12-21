const socket = io();

socket.on("sensors", (data) => {
  const s = Array.isArray(data) ? data[0] : data;
  if (!s) return;
  document.getElementById("temp").textContent = `${s.temperature} °C`;
  document.getElementById("hum").textContent  = `${s.humidity} %`;
  document.getElementById("light").textContent= `${s.light} lux`;
});

socket.on("deviceStatus", (st) => {
  document.getElementById("led1").textContent = st.led1 ? "ON" : "OFF";
  document.getElementById("led2").textContent = st.led2 ? "ON" : "OFF";
  document.getElementById("led3").textContent = st.led3 ? "ON" : "OFF";
  document.getElementById("led4").textContent = st.led4 ? "ON" : "OFF";
  document.getElementById("fan").textContent  = st.fan ? "ON" : "OFF";
  document.getElementById("curtainMode").textContent = st.curtainMode ?? "--";
});

socket.on("autoAction", (info) => {
  const div = document.getElementById("auto-log");
  const line = `[${new Date().toLocaleTimeString()}] Auto: ${info.reason} -> ${info.action} (${info.value})`;
  div.textContent = line;
});

socket.on("scheduleAction", (info) => {
  const div = document.getElementById("auto-log");
  const line = `[${new Date().toLocaleTimeString()}] Schedule "${info.name}" ${info.time} -> ${info.cmd}`;
  div.textContent = line;
});

const ctx = document.getElementById("sensorChart").getContext("2d");
const chartData = {
  labels: [],
  datasets: [
    { label: "Nhiệt độ (°C)", data: [], borderColor: "red", tension: 0.2 },
    { label: "Độ ẩm (%)", data: [], borderColor: "blue", tension: 0.2 },
    { label: "Ánh sáng (lux)", data: [], borderColor: "gold", tension: 0.2 }
  ]
};
const sensorChart = new Chart(ctx, {
  type: "line",
  data: chartData,
  options: {
    responsive: true,
    animation: false,
    plugins: { legend: { position: "bottom" } },
    scales: {
      x: { title: { display: true, text: "Thời gian" } },
      y: { title: { display: true, text: "Giá trị" }, beginAtZero: true }
    }
  }
});
socket.on("sensorsHistory", (history) => {
  chartData.labels = history.map(s => new Date(s.timestamp).toLocaleTimeString());
  chartData.datasets[0].data = history.map(s => s.temperature);
  chartData.datasets[1].data = history.map(s => s.humidity);
  chartData.datasets[2].data = history.map(s => s.light ?? 0);
  sensorChart.update();
});
socket.on("sensors", (data) => {
  const s = Array.isArray(data) ? data[0] : data;
  if (!s) return;
  chartData.labels.push(new Date().toLocaleTimeString());
  chartData.datasets[0].data.push(s.temperature);
  chartData.datasets[1].data.push(s.humidity);
  chartData.datasets[2].data.push(s.light ?? 0);
  if (chartData.labels.length > 60) {
    chartData.labels.shift();
    chartData.datasets.forEach(d => d.data.shift());
  }
  sensorChart.update();
});

async function sendCmd(topic, cmd) {
  const res = await fetch("/api/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, cmd })
  });
  const r = await res.json();
  if (!r.ok) alert("Gửi lệnh thất bại");
}

socket.on("thresholds", (th) => {
  document.getElementById("th-enabled").checked = !!th.enabled;
  document.getElementById("th-tmin").value = th.temperature?.min ?? "";
  document.getElementById("th-tmax").value = th.temperature?.max ?? "";
  document.getElementById("th-ttopic").value = th.temperature?.actionTopic ?? "truong/home/cmd/fan";
  document.getElementById("th-ton").value = th.temperature?.actionOn ?? "ON";
  document.getElementById("th-toff").value = th.temperature?.actionOff ?? "OFF";
});
document.getElementById("thresholdForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    enabled: document.getElementById("th-enabled").checked,
    temperature: {
      min: parseFloat(document.getElementById("th-tmin").value),
      max: parseFloat(document.getElementById("th-tmax").value),
      actionTopic: document.getElementById("th-ttopic").value,
      actionOn: document.getElementById("th-ton").value,
      actionOff: document.getElementById("th-toff").value
    }
  };
  const res = await fetch("/api/thresholds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const r = await res.json();
  if (r.ok) alert("Đã lưu auto mode");
});

function renderSchedules(items) {
  const container = document.getElementById("scheduleList");
  container.innerHTML = "";
  items.forEach(i => {
    const row = document.createElement("div");
    row.className = "d-flex align-items-center gap-2 py-1 border-bottom";
    row.innerHTML = `
      <div class="flex-grow-1">${i.name} — ${i.time} — ${i.topic} — ${i.cmd}</div>
      <button class="btn btn-sm ${i.enabled ? "btn-success" : "btn-outline-secondary"}" onclick="toggleSchedule('${i._id}')">
        ${i.enabled ? "Bật" : "Tắt"}
      </button>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteSchedule('${i._id}')">Xóa</button>
    `;
    container.appendChild(row);
  });
}
socket.on("schedules", renderSchedules);

document.getElementById("scheduleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: document.getElementById("sc-name").value,
    time: document.getElementById("sc-time").value,
    topic: document.getElementById("sc-topic").value,
    cmd: document.getElementById("sc-cmd").value,
    enabled: true
  };
  const res = await fetch("/api/schedules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const r = await res.json();
  if (!r.ok) alert("Thêm lịch thất bại");
});
async function toggleSchedule(id) {
  const res = await fetch(`/api/schedules/${id}/toggle`, { method: "POST" });
  const r = await res.json();
  if (!r.ok) alert("Toggle lịch thất bại");
}
async function deleteSchedule(id) {
  const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
  const r = await res.json();
  if (!r.ok) alert("Xóa lịch thất bại");
}
