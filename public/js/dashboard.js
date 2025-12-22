const socket = io();
let deviceState = {}; // lưu trạng thái hiện tại

// ====== Cảm biến realtime ======
socket.on("sensors", (data) => {
  const s = Array.isArray(data) ? data[0] : data;
  if (!s) return;
  document.getElementById("temp").textContent = `${s.temperature} °C`;
  document.getElementById("hum").textContent  = `${s.humidity} %`;
  document.getElementById("light").textContent= `${s.light} lux`;
  // thêm hiển thị encoder
if (s.fanRPS !== undefined) {
  document.getElementById("fanRPS").textContent = s.fanRPS.toFixed(2) + " vòng/s";
}
if (s.curtainPercent !== undefined) {
  const bar = document.getElementById("curtainPercent");
  bar.style.width = s.curtainPercent.toFixed(1) + "%";
  bar.textContent = s.curtainPercent.toFixed(1) + "%";
}
});

// ====== Trạng thái thiết bị realtime ======
socket.on("deviceStatus", (st) => {
  deviceState = st;

  document.getElementById("led1").textContent = st.led1 ? "ON" : "OFF";
  document.getElementById("led2").textContent = st.led2 ? "ON" : "OFF";
  document.getElementById("led3").textContent = st.led3 ? "ON" : "OFF";
  document.getElementById("led4").textContent = st.led4 ? "ON" : "OFF";
  document.getElementById("fan").textContent  = st.fan ? "ON" : "OFF";
// curtainMode: 0=STOP_AFTER_CLOSE, 1=OPEN, 2=STOP_AFTER_OPEN, 3=CLOSE
let curtainText = "--";
if (st.curtainMode === 0) curtainText = "STOP (sau đóng)";
else if (st.curtainMode === 1) curtainText = "OPEN";
else if (st.curtainMode === 2) curtainText = "STOP (sau mở)";
else if (st.curtainMode === 3) curtainText = "CLOSE";
document.getElementById("curtainMode").textContent = curtainText;

  // cập nhật màu nút toggle
  updateButton("btn-curtain", st.curtainMode !== 0 && st.curtainMode !== 2);
});
// ====== Cập nhật màu nút toggle ======
function updateButton(id, state) {
  const btn = document.getElementById(id);
  if (!btn) return;
  if (state) {
    btn.classList.remove("btn-outline-danger","btn-outline-primary");
    btn.classList.add("btn-success");
  } else {
    btn.classList.remove("btn-success");
    btn.classList.add("btn-outline-danger");
  }
}

// ====== Toggle LED/Fan ======
async function toggleDevice(topic, field) {
  const current = deviceState[field];
  const cmd = current ? "OFF" : "ON";
  await sendCmd(topic, cmd);
}
// ====== Rèm: 1 nút duy nhất TOGGLE ======
async function toggleCurtain() {
  await sendCmd("truong/home/cmd/curtain", "CURTAIN_TOGGLE");
}


// ====== Gửi lệnh tới server ======
async function sendCmd(topic, cmd) {
  const res = await fetch("/api/cmd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, cmd })
  });
  const r = await res.json();
  if (!r.ok) alert("Gửi lệnh thất bại");
}
// ====== Log auto ======
socket.on("autoAction", (info) => {
  const div = document.getElementById("auto-log");
  div.textContent = `[${new Date().toLocaleTimeString()}] Auto: ${info.reason} -> ${info.action} (${info.value})`;
});
// ====== Log schedule ======
socket.on("scheduleAction", (info) => {
  const div = document.getElementById("schedule-log");
  div.textContent = `[${new Date().toLocaleTimeString()}] Schedule "${info.name}" ${info.date} ${info.time} -> ${info.cmd}`;
});

// ====== Biểu đồ cảm biến ======
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
// ====== Auto mode (ngưỡng) ======
function updateActionOptions() {
  const device = document.getElementById("th-device").value;
  const maxSel = document.getElementById("th-action-max");
  const minSel = document.getElementById("th-action-min");

  maxSel.innerHTML = "";
  minSel.innerHTML = "";

  if (device === "curtain") {
    ["OPEN","CLOSE","STOP"].forEach(opt => {
      maxSel.innerHTML += `<option value="${opt}">${opt}</option>`;
      minSel.innerHTML += `<option value="${opt}">${opt}</option>`;
    });
  } else {
    ["ON","OFF"].forEach(opt => {
      maxSel.innerHTML += `<option value="${opt}">${opt}</option>`;
      minSel.innerHTML += `<option value="${opt}">${opt}</option>`;
    });
  }
}
updateActionOptions();

socket.on("thresholds", (th) => {
  document.getElementById("th-enabled").checked = !!th.enabled;
  document.getElementById("th-device").value = th.device ?? "fan";
  document.getElementById("th-date").value = th.date ?? "";
  document.getElementById("th-timeStart").value = th.timeStart ?? "";
  document.getElementById("th-timeEnd").value = th.timeEnd ?? "";

  document.getElementById("th-tmin").value = th.thresholds?.temperature?.min ?? "";
  document.getElementById("th-tmax").value = th.thresholds?.temperature?.max ?? "";
  document.getElementById("th-hmin").value = th.thresholds?.humidity?.min ?? "";
  document.getElementById("th-hmax").value = th.thresholds?.humidity?.max ?? "";
  document.getElementById("th-lmin").value = th.thresholds?.light?.min ?? "";
  document.getElementById("th-lmax").value = th.thresholds?.light?.max ?? "";

  updateActionOptions();
  document.getElementById("th-action-max").value = th.actionMax ?? "ON";
  document.getElementById("th-action-min").value = th.actionMin ?? "OFF";
});

document.getElementById("thresholdForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    enabled: document.getElementById("th-enabled").checked,
    device: document.getElementById("th-device").value,
    date: document.getElementById("th-date").value,
    timeStart: document.getElementById("th-timeStart").value,
    timeEnd: document.getElementById("th-timeEnd").value,
    thresholds: {
      temperature: {
        min: parseFloat(document.getElementById("th-tmin").value) || null,
        max: parseFloat(document.getElementById("th-tmax").value) || null
      },
      humidity: {
        min: parseFloat(document.getElementById("th-hmin").value) || null,
        max: parseFloat(document.getElementById("th-hmax").value) || null
      },
      light: {
        min: parseFloat(document.getElementById("th-lmin").value) || null,
        max: parseFloat(document.getElementById("th-lmax").value) || null
      }
    },
    actionMax: document.getElementById("th-action-max").value,
    actionMin: document.getElementById("th-action-min").value
  };

  const res = await fetch("/api/thresholds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const r = await res.json();
  if (r.ok) alert("Đã lưu auto mode");
});

// ====== Lịch hẹn ======
function renderSchedules(items) {
  const container = document.getElementById("scheduleList");
  container.innerHTML = "";
  items.forEach(i => {
    const row = document.createElement("div");
    row.className = "d-flex align-items-center gap-2 py-1 border-bottom";
    row.innerHTML = `
      <div class="flex-grow-1">${i.name} — ${i.date} ${i.time} — ${i.device} — ${i.cmd}</div>
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
    date: document.getElementById("sc-date").value,
    time: document.getElementById("sc-time").value,
    device: document.getElementById("sc-device").value,
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

// Toggle bật/tắt lịch hẹn
async function toggleSchedule(id) {
  const res = await fetch(`/api/schedules/${id}/toggle`, { method: "POST" });
  const r = await res.json();
  if (!r.ok) alert("Toggle lịch thất bại");
}

// Xóa lịch hẹn
async function deleteSchedule(id) {
  const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
  const r = await res.json();
  if (!r.ok) alert("Xóa lịch thất bại");
}
function updateScheduleCmdOptions() {
  const device = document.getElementById("sc-device").value;
  const cmdSelect = document.getElementById("sc-cmd");

  cmdSelect.innerHTML = ""; // xoá options cũ

  let options = [];
  if (device.startsWith("led") || device === "fan") {
    options = ["ON", "OFF"];
  } else if (device === "curtain") {
    options = ["OPEN", "CLOSE", "STOP"];
  }

  options.forEach(opt => {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    cmdSelect.appendChild(o);
  });
}

// gọi khi chọn thiết bị
document.getElementById("sc-device").addEventListener("change", updateScheduleCmdOptions);

// gọi 1 lần khi load trang để khởi tạo
document.addEventListener("DOMContentLoaded", updateScheduleCmdOptions);

// Nhận danh sách user từ server
socket.on("users", (users) => {
  const tbody = document.querySelector("#usersTable tbody");
  tbody.innerHTML = "";
  users.forEach(u => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.role}</td>
      <td>${(u.allowedDevices || []).join(", ")}</td>
      <td>
        <button class="btn btn-sm btn-warning" onclick="editUser('${u._id}', '${u.role}', '${(u.allowedDevices || []).join(",")}')">Sửa</button>
        <button class="btn btn-sm btn-danger" onclick="deleteUser('${u._id}')">Xóa</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
});

// Thêm user mới
document.getElementById("addUserForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const devices = Array.from(form.allowedDevices.selectedOptions).map(opt => opt.value);

  const payload = {
    username: form.username.value,
    password: form.password.value,
    role: form.role.value,
    allowedDevices: devices
  };

  await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  form.reset();
});


// Xóa user
async function deleteUser(id) {
  await fetch(`/api/users/${id}`, { method: "DELETE" });
}

// Sửa user
async function editUser(id, role, allowedDevices) {
  const newRole = prompt("Nhập role mới (admin/user):", role);
  const newDevices = prompt("Nhập danh sách thiết bị (fan,led1,...):", allowedDevices);
  await fetch(`/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role: newRole,
      allowedDevices: newDevices.split(",").map(s => s.trim())
    })
  });
}
// Nhận danh sách auto mode từ server
socket.on("thresholds", (list) => {
  const tbody = document.querySelector("#thresholdsTable tbody");
  tbody.innerHTML = "";
  list.forEach(th => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${th.device}</td>
      <td>${th.date || "--"}</td>
      <td>${th.timeStart || "--"}</td>
      <td>${th.timeEnd || "--"}</td>
      <td>${th.enabled ? "ON" : "OFF"}</td>
      <td>
        <button class="btn btn-sm btn-warning" onclick="toggleThreshold('${th._id}')">Bật/Tắt</button>
        <button class="btn btn-sm btn-danger" onclick="deleteThreshold('${th._id}')">Xóa</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
});

// Nhận danh sách lịch hẹn từ server
socket.on("schedules", (list) => {
  const tbody = document.querySelector("#schedulesTable tbody");
  tbody.innerHTML = "";
  list.forEach(sc => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sc.name}</td>
      <td>${sc.date || "--"}</td>
      <td>${sc.time}</td>
      <td>${sc.device}</td>
      <td>${sc.cmd}</td>
      <td>${sc.enabled ? "ON" : "OFF"}</td>
      <td>
        <button class="btn btn-sm btn-warning" onclick="toggleSchedule('${sc._id}')">Bật/Tắt</button>
        <button class="btn btn-sm btn-info" onclick="editSchedule('${sc._id}')">Sửa</button>
        <button class="btn btn-sm btn-danger" onclick="deleteSchedule('${sc._id}')">Xóa</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
});

// ====== Các hàm thao tác ======
async function toggleSchedule(id) {
  await fetch(`/api/schedules/${id}/toggle`, { method: "POST" });
}
async function deleteSchedule(id) {
  await fetch(`/api/schedules/${id}`, { method: "DELETE" });
}
async function editSchedule(id) {
  // tuỳ bạn: có thể mở modal, hoặc điền lại form với dữ liệu cũ
  alert("Chức năng sửa schedule: lấy dữ liệu từ server và điền lại form");
}

// Với thresholds, server hiện chưa có API toggle/xóa.
// Nếu bạn muốn bật/tắt/xóa auto mode thì cần bổ sung API tương tự schedules.
async function toggleThreshold(id) {
  await fetch(`/api/thresholds/${id}/toggle`, { method: "POST" });
}
async function deleteThreshold(id) {
  await fetch(`/api/thresholds/${id}`, { method: "DELETE" });
}


