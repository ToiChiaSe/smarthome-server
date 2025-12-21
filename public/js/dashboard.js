const socket = io();

// Hiển thị cảm biến realtime
socket.on("sensors", (data) => {
  const s = Array.isArray(data) ? data[0] : data;
  if (!s) return;
  document.getElementById("temp").textContent = `${s.temperature} °C`;
  document.getElementById("hum").textContent  = `${s.humidity} %`;
  document.getElementById("light").textContent= `${s.light} lux`;
});

// Hiển thị trạng thái thiết bị realtime
socket.on("deviceStatus", (st) => {
  document.getElementById("led1").textContent = st.led1 ? "ON" : "OFF";
  document.getElementById("led2").textContent = st.led2 ? "ON" : "OFF";
  document.getElementById("led3").textContent = st.led3 ? "ON" : "OFF";
  document.getElementById("led4").textContent = st.led4 ? "ON" : "OFF";
  document.getElementById("fan").textContent  = st.fan ? "ON" : "OFF";
  document.getElementById("curtainMode").textContent = st.curtainMode ?? "--";
});

// Chart.js setup
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

// Lịch sử ban đầu
socket.on("sensorsHistory", (history) => {
  chartData.labels = history.map(s => new Date(s.timestamp).toLocaleTimeString());
  chartData.datasets[0].data = history.map(s => s.temperature);
  chartData.datasets[1].data = history.map(s => s.humidity);
  chartData.datasets[2].data = history.map(s => s.light ?? 0);
  sensorChart.update();
});

// Thêm điểm mới realtime
socket.on("sensors", (data) => {
  const s = Array.isArray(data) ? data[0] : data;
  if (!s) return;
  const tsLabel = new Date().toLocaleTimeString();
  chartData.labels.push(tsLabel);
  chartData.datasets[0].data.push(s.temperature);
  chartData.datasets[1].data.push(s.humidity);
  chartData.datasets[2].data.push(s.light ?? 0);

  if (chartData.labels.length > 60) {
    chartData.labels.shift();
    chartData.datasets.forEach(ds => ds.data.shift());
  }
  sensorChart.update();
});

// ====== Điều khiển thiết bị ======
async function sendCmd(topic, cmd) {
  try {
    const res = await fetch("/api/cmd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, cmd })
    });
    const result = await res.json();
    if (result.ok) {
      console.log("Command sent:", topic, cmd);
    } else {
      console.error("Command failed");
    }
  } catch (err) {
    console.error("Error sending command:", err);
  }
}

