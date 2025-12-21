// app.js
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import methodOverride from "method-override";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import mqtt from "mqtt";

const app = express();

// Env vars
const PORT = process.env.PORT || 3000;
const DB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || "change_this";
const MQTT_URL = process.env.MQTT_URL || "mqtt://test.mosquitto.org:1883";

// Connect DB
mongoose.connect(DB_URI, { dbName: "smarthome" })
  .then(() => console.log("MongoDB connected"))
  .catch((e) => console.error("MongoDB error:", e));

// Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  passwordHash: String,
  role: { type: String, enum: ["admin", "guest"], default: "guest" },
  permissions: []
});
const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, unique: true },
  type: String,
  room: String,
  state: { on: { type: Boolean, default: false } }
});
const thresholdSchema = new mongoose.Schema({
  sensorType: String, comparator: String, value: Number,
  actions: [String], enabled: { type: Boolean, default: true }
});
const scheduleSchema = new mongoose.Schema({
  deviceId: String, cron: String, action: String,
  enabled: { type: Boolean, default: true }
});

const User = mongoose.model("User", userSchema);
const Device = mongoose.model("Device", deviceSchema);
const Threshold = mongoose.model("Threshold", thresholdSchema);
const Schedule = mongoose.model("Schedule", scheduleSchema);

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(methodOverride("_method"));

// Auth helpers
function signToken(u) {
  return jwt.sign({ username: u.username, role: u.role }, JWT_SECRET, { expiresIn: "2h" });
}
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect("/login");
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.redirect("/login"); }
}
function apiAuth(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization?.split(" ")[1]);
  if (!token) return res.status(401).json({ error: "No token" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}

// Seed admin
(async () => {
  const exists = await User.findOne({ username: "admin" });
  if (!exists) {
    const hash = await bcrypt.hash("123456", 10);
    await User.create({ username: "admin", passwordHash: hash, role: "admin" });
    console.log("Seeded admin: admin/123456");
  }
})();

// MQTT connect
const mqttClient = mqtt.connect(MQTT_URL);
let lastSensorData = null;
let lastStatusData = null;
let lastOtaResult = null;

mqttClient.on("connect", () => {
  console.log("MQTT connected:", MQTT_URL);
  mqttClient.subscribe("truong/home/cambien");
  mqttClient.subscribe("truong/home/status");
  mqttClient.subscribe("truong/home/status/ota");
});
mqttClient.on("message", async (topic, message) => {
  if (topic === "truong/home/cambien") {
    try { lastSensorData = JSON.parse(message.toString()); } catch {}
    const thresholds = await Threshold.find({ sensorType: { $exists: true }, enabled: true });
    thresholds.forEach(t => {
      const val = lastSensorData[t.sensorType];
      if (val !== undefined) {
        if (eval(`${val} ${t.comparator} ${t.value}`)) {
          t.actions.forEach(act => {
            mqttClient.publish("truong/home/cmd/device", act);
          });
        }
      }
    });
  }
  if (topic === "truong/home/status") {
    try { lastStatusData = JSON.parse(message.toString()); } catch {}
  }
  if (topic === "truong/home/status/ota") {
    lastOtaResult = message.toString();
  }
});

// Views
function layout(title, user, bodyHtml) {
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>${title}</title>
  <style>
  :root {
    --bg-color: #eef1f5; --text-color: #333; --card-bg: #fff;
    --nav-bg: #1f2937; --nav-text: #fff;
  }
  body.dark {
    --bg-color: #111827; --text-color: #e5e7eb; --card-bg: #1f2937;
    --nav-bg: #000; --nav-text: #e5e7eb;
  }
  body { font-family: 'Segoe UI', Roboto, sans-serif; background: var(--bg-color); color: var(--text-color); }
  nav { background: var(--nav-bg); padding: 14px 24px; display: flex; gap: 20px; align-items: center; }
  nav a, nav button { color: var(--nav-text); text-decoration: none; font-weight: 500; }
  nav a:hover { color: #60a5fa; }
  .container { max-width: 1200px; margin: 30px auto; padding: 20px; }
  .card { background: var(--card-bg); border-radius: 12px; padding: 20px; box-shadow: 0 6px 16px rgba(0,0,0,0.08); margin-bottom: 20px; }
  h1,h2 { color: var(--text-color); }
  canvas { width: 100% !important; height: 280px !important; }
  button { padding: 10px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
  .btn-green { background: #10b981; color: #fff; } .btn-green:hover { background: #059669; }
  .btn-red { background: #ef4444; color: #fff; } .btn-red:hover { background: #dc2626; }
  .btn-gray { background: #6b7280; color: #fff; } .btn-gray:hover { background: #4b5563; }
  ul { list-style: none; padding: 0; } li { margin-bottom: 10px; }
  </style>
  </head><body>
  <nav>
    <a href="/dashboard">Dashboard</a>
    <a href="/thresholds">Thresholds</a>
    <a href="/schedules">Scheduler</a>
    <a href="/users">Users</a>
    ${user ? `<form method="post" action="/api/auth/logout" style="display:inline;"><button>Logout (${user.username})</button></form>` : ""}
    <button type="button" onclick="toggleDarkMode()" style="margin-left:auto;">🌓 Dark Mode</button>
  </nav>
  <script>function toggleDarkMode(){document.body.classList.toggle('dark');}</script>
  ${bodyHtml}
  </body></html>`;
}

// Routes
app.get("/", (req, res) => res.redirect("/login"));
app.get("/login", (req, res) => {
  res.send(`<div class="container"><div class="card"><h2>Login</h2>
    <form method="post" action="/api/auth/login">
      <input name="username" placeholder="username"/>
      <input name="password" type="password" placeholder="password"/>
      <button class="btn-green" type="submit">Login</button>
    </form></div></div>`);
});
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const u = await User.findOne({ username });
  if (!u) return res.status(401).send("Sai tài khoản/mật khẩu");
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return res.status(401).send("Sai tài khoản/mật khẩu");
  const token = signToken(u);
  res.cookie("token", token, { httpOnly: true });
  res.redirect("/dashboard");
});
app.post("/api/auth/logout", (req, res) => { res.clearCookie("token"); res.redirect("/login"); });

// Dashboard
// Dashboard
app.get("/dashboard", requireAuth, async (req, res) => {
  const devices = await Device.find().lean();

  let body = `
  <div class="container">
    <div style="display:flex; gap:20px; flex-wrap:wrap;">
      <div class="card" style="flex:1; min-width:400px;">
        <h2>Dữ liệu cảm biến realtime</h2>
        <canvas id="sensorChart"></canvas>
      </div>
      <div class="card" style="flex:1; min-width:400px;">
        <h2>Trạng thái thiết bị realtime</h2>
        <canvas id="statusChart"></canvas>
      </div>
    </div>

    <div class="card">
      <h2>Danh sách thiết bị</h2>
      <ul>
        ${devices.map(d=>`
          <li>
            ${d.deviceId} - ${d.state.on?"ON":"OFF"}
            <form method="post" action="/api/devices/${d.deviceId}/command" style="display:inline;">
              <input type="hidden" name="cmd" value="${d.state.on?"OFF":"ON"}"/>
              <button class="btn-gray">${d.state.on?"Tắt":"Bật"}</button>
            </form>
          </li>`).join("")}
      </ul>
    </div>

    ${req.user.role==="admin" ? `
      <div class="card">
        <h2>OTA Update</h2>
        <form method="post" action="/api/ota">
          <input name="url" placeholder="Firmware URL" required style="width:70%; padding:10px; border:1px solid #ccc; border-radius:6px;"/>
          <button class="btn-green">Gửi OTA</button>
        </form>
        ${lastOtaResult ? `<p><strong>Kết quả OTA:</strong> ${lastOtaResult}</p>` : ""}
      </div>
    ` : ""}
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    // Chart cảm biến
    const ctx1 = document.getElementById('sensorChart').getContext('2d');
    const sensorChart = new Chart(ctx1, {
      type: 'line',
      data: { labels: [], datasets: [
        { label: 'Nhiệt độ (°C)', data: [], borderColor: 'red', fill: false },
        { label: 'Độ ẩm (%)', data: [], borderColor: 'blue', fill: false },
        { label: 'Ánh sáng (lux)', data: [], borderColor: 'orange', fill: false }
      ]},
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
    async function fetchSensors() {
      const res = await fetch('/api/sensors');
      const data = await res.json();
      if (data && data.ts) {
        sensorChart.data.labels.push(new Date().toLocaleTimeString());
        sensorChart.data.datasets[0].data.push(data.nhietdo);
        sensorChart.data.datasets[1].data.push(data.doam);
        sensorChart.data.datasets[2].data.push(data.anhSang);
        if (sensorChart.data.labels.length > 20) {
          sensorChart.data.labels.shift();
          sensorChart.data.datasets.forEach(ds => ds.data.shift());
        }
        sensorChart.update();
      }
    }
    setInterval(fetchSensors, 5000);

    // Chart trạng thái
    const ctx2 = document.getElementById('statusChart').getContext('2d');
    const statusChart = new Chart(ctx2, {
      type: 'line',
      data: { labels: [], datasets: [
        { label: 'Quạt RPM', data: [], borderColor: 'green', fill: false },
        { label: 'Rèm (%)', data: [], borderColor: 'purple', fill: false },
        { label: 'Fan Running', data: [], borderColor: 'blue', fill: false },
        { label: 'Curtain Running', data: [], borderColor: 'orange', fill: false }
      ]},
      options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
    async function fetchStatus() {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data && data.ts) {
        statusChart.data.labels.push(new Date().toLocaleTimeString());
        statusChart.data.datasets[0].data.push(data.fanRPM || 0);
        statusChart.data.datasets[1].data.push(data.curtainPercent || 0);
        statusChart.data.datasets[2].data.push(data.fanRunning ? 1 : 0);
        statusChart.data.datasets[3].data.push(data.curtainRunning ? 1 : 0);
        if (statusChart.data.labels.length > 20) {
          statusChart.data.labels.shift();
          statusChart.data.datasets.forEach(ds => ds.data.shift());
        }
        statusChart.update();
      }
    }
    setInterval(fetchStatus, 5000);
  </script>
  `;

  res.send(layout("Dashboard", req.user, body));
});

// API devices
app.post("/api/devices/:id/command", apiAuth, async (req, res) => {
  const { id } = req.params; const { cmd } = req.body;
  mqttClient.publish(`truong/home/cmd/${id}`, cmd);
  const device = await Device.findOne({ deviceId: id });
  if (device) { device.state.on = cmd === "ON"; await device.save(); }
  res.redirect("/dashboard");
});

// OTA API (chỉ admin)
app.post("/api/ota", apiAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).send("Chỉ admin mới được phép OTA");
  const { url } = req.body;
  if (!url) return res.status(400).send("Thiếu URL firmware");
  const msg = JSON.stringify({ url });
  mqttClient.publish("truong/home/cmd/ota", msg);
  res.redirect("/dashboard");
});

// API sensors & status
app.get("/api/sensors", apiAuth, (req, res) => res.json(lastSensorData || {}));
app.get("/api/status", apiAuth, (req, res) => res.json(lastStatusData || {}));

// Thresholds page
app.get("/thresholds", requireAuth, async (req, res) => {
  const thresholds = await Threshold.find().lean();
  const body = `<div class="container"><div class="card"><h2>Thresholds</h2>
    <ul>${thresholds.map(t=>`<li>${t.sensorType} ${t.comparator} ${t.value} → ${t.actions.join(",")}</li>`).join("")}</ul>
  </div></div>`;
  res.send(layout("Thresholds", req.user, body));
});

// Schedules page
app.get("/schedules", requireAuth, async (req, res) => {
  const schedules = await Schedule.find().lean();
  const body = `<div class="container"><div class="card"><h2>Schedules</h2>
    <ul>${schedules.map(s=>`<li>${s.deviceId} ${s.cron} ${s.action}</li>`).join("")}</ul>
  </div></div>`;
  res.send(layout("Schedules", req.user, body));
});

// Users page + form tạo user
app.get("/users", requireAuth, async (req, res) => {
  const users = await User.find().lean();
  const body = `<div class="container"><div class="card"><h2>Users</h2>
    <ul>${users.map(u=>`<li>${u.username} (${u.role})</li>`).join("")}</ul>
    <h3>Thêm người dùng</h3>
    <form method="post" action="/api/users">
      <input name="username" placeholder="username" required />
      <input name="password" type="password" placeholder="password" required />
      <select name="role"><option value="guest">Guest</option><option value="admin">Admin</option></select>
      <button class="btn-green" type="submit">Thêm</button>
    </form>
  </div></div>`;
  res.send(layout("Users", req.user, body));
});

// API tạo user mới (kiểm tra trùng username)
app.post("/api/users", apiAuth, async (req, res) => {
  const { username, password, role } = req.body;
  const exists = await User.findOne({ username });
  if (exists) return res.status(400).send("Username đã tồn tại, vui lòng chọn tên khác");
  const hash = await bcrypt.hash(password, 10);
  await User.create({ username, passwordHash: hash, role, permissions: [] });
  res.redirect("/users");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
