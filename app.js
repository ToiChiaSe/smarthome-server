// app.js
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import methodOverride from "method-override";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const app = express();

// Env vars
const PORT = process.env.PORT || 8080;
const DB_URI = process.env.DB_URI;
const JWT_SECRET = process.env.JWT_SECRET || "change_this";

// Connect DB
mongoose.connect(DB_URI, { dbName: "smarthome" })
  .then(() => console.log("MongoDB connected"))
  .catch((e) => console.error("MongoDB error:", e));

// Schemas
const permissionSchema = new mongoose.Schema({
  resourceType: { type: String, default: "device" },
  resourceId: String,
  actions: [String]
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  passwordHash: String,
  role: { type: String, enum: ["admin", "guest"], default: "guest" },
  permissions: [permissionSchema]
}, { timestamps: true });

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, unique: true },
  type: String,
  room: String,
  state: { on: { type: Boolean, default: false } }
}, { timestamps: true });

const thresholdSchema = new mongoose.Schema({
  sensorType: String, comparator: String, value: Number,
  actions: [String], enabled: { type: Boolean, default: true }
}, { timestamps: true });

const scheduleSchema = new mongoose.Schema({
  deviceId: String, cron: String, action: String,
  enabled: { type: Boolean, default: true }
}, { timestamps: true });

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
  return jwt.sign(
    { username: u.username, role: u.role, permissions: u.permissions },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.redirect("/login");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.redirect("/login");
  }
}
function apiAuth(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization?.split(" ")[1]);
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// Seed admin on startup
(async () => {
  const exists = await User.findOne({ username: "admin" });
  if (!exists) {
    const hash = await bcrypt.hash("123456", 10);
    await User.create({ username: "admin", passwordHash: hash, role: "admin", permissions: [] });
    console.log("Seeded admin: admin/123456");
  }
})();

// Views: inline HTML
function layout(title, user, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"><title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#f5f7fa;color:#2c3e50}
nav{background:#34495e;padding:12px;display:flex;align-items:center;gap:16px}
nav a{color:#ecf0f1;text-decoration:none;font-weight:500}
nav a:hover{text-decoration:underline}
.btn-link{background:none;border:none;color:#ecf0f1;cursor:pointer;font-size:14px}
.container{padding:20px;max-width:1000px;margin:auto}
h1{margin-bottom:20px;font-size:28px}
h2{margin-top:30px;margin-bottom:12px;font-size:22px}
table{width:100%;border-collapse:collapse;margin-top:12px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.1)}
th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}
th{background:#2c3e50;color:#ecf0f1}
tr:hover{background:#f0f8ff}
form{margin-top:12px}
input,select{padding:10px;margin-bottom:12px;border:1px solid #ccc;border-radius:6px;width:100%}
button{padding:10px 16px;border:none;border-radius:6px;cursor:pointer}
.btn-green{background:linear-gradient(90deg,#27ae60,#2ecc71);color:#fff;font-weight:600}
.btn-green:hover{opacity:.9}
.btn-red{background:#e74c3c;color:#fff;font-weight:600}
.btn-red:hover{opacity:.9}
.btn-gray{background:#95a5a6;color:#fff;font-weight:600}
.muted{color:#6b7280;font-size:14px}
section{margin-bottom:32px}
.login-page{display:flex;justify-content:center;align-items:center;height:100vh}
.login-box{background:#fff;padding:30px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.2);width:320px}
.login-box h2{margin-bottom:20px;text-align:center}
.login-box input{display:block;width:100%;margin-bottom:12px;padding:10px;border:1px solid #ccc;border-radius:6px}
</style>
</head>
<body>
<nav>
  <a href="/dashboard">Dashboard</a>
  <a href="/thresholds">Thresholds</a>
  <a href="/schedules">Scheduler</a>
  <a href="/users">Users</a>
  ${user ? `<form method="post" action="/api/auth/logout" style="display:inline;"><button class="btn-link">Logout (${user.username})</button></form>` : ""}
</nav>
<div class="container">
${bodyHtml}
</div>
</body></html>`;
}

// Pages
app.get("/", (req, res) => res.redirect("/login"));

app.get("/login", (req, res) => {
  res.send(`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>Đăng nhập</title>
  <style>
  ${layout("", null, "").match(/<style>([\s\S]*?)<\/style>/)[1]}
  </style></head><body class="login-page">
  <div class="login-box">
    <h2>SmartHome Login</h2>
    <form method="post" action="/api/auth/login">
      <input type="text" name="username" placeholder="Tên đăng nhập" required>
      <input type="password" name="password" placeholder="Mật khẩu" required>
      <button type="submit" class="btn-green">Đăng nhập</button>
    </form>
  </div>
  </body></html>`);
});

// Login/logout
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const u = await User.findOne({ username });
  if (!u) return res.status(401).send("Sai tài khoản hoặc mật khẩu");
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) return res.status(401).send("Sai tài khoản hoặc mật khẩu");
  const token = signToken(u);
  res.cookie("token", token, { httpOnly: true, sameSite: "lax", secure: true });
  res.redirect("/dashboard");
});
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

// Dashboard devices page (with forms)
app.get("/dashboard", requireAuth, async (req, res) => {
  const devices = await Device.find().lean();
  const body = `
<h1>SmartHome Dashboard</h1>
<section>
  <h2>Thiết bị</h2>
  <table>
    <thead><tr><th>ID</th><th>Type</th><th>Room</th><th>State</th><th>Hành động</th></tr></thead>
    <tbody>
      ${devices.map(d => `
        <tr>
          <td>${d.deviceId}</td><td>${d.type}</td><td>${d.room}</td><td>${d.state?.on ? "ON" : "OFF"}</td>
          <td>
            <form method="post" action="/api/devices/${d.deviceId}/command" style="display:inline;">
              <input type="hidden" name="cmd" value="${d.state?.on ? "OFF" : "ON"}" />
              <button class="btn-gray" type="submit">${d.state?.on ? "Tắt" : "Bật"}</button>
            </form>
            <form method="post" action="/api/devices/${d.deviceId}?_method=DELETE" style="display:inline;">
              <button class="btn-red" type="submit">Xóa</button>
            </form>
          </td>
        </tr>`).join("")}
    </tbody>
  </table>

  <h3 style="margin-top:20px;">Thêm thiết bị</h3>
  <form method="post" action="/api/devices">
    <input name="deviceId" placeholder="deviceId" required />
    <input name="type" placeholder="type (light/fan/...)" required />
    <input name="room" placeholder="room" required />
    <select name="on">
      <option value="false">OFF</option>
      <option value="true">ON</option>
    </select>
    <button class="btn-green" type="submit">Thêm</button>
  </form>
</section>
<p class="muted">API điều khiển: POST /api/devices/:id/command { cmd: "ON" | "OFF" }</p>
`;
  res.send(layout("SmartHome Dashboard", req.user, body));
});

// Thresholds page
app.get("/thresholds", requireAuth, async (req, res) => {
  const thresholds = await Threshold.find().lean();
  const body = `
<h1>Ngưỡng cảm biến</h1>
<section>
  <table>
    <thead><tr><th>Sensor</th><th>Comparator</th><th>Value</th><th>Actions</th><th>Enabled</th><th>Hành động</th></tr></thead>
    <tbody>
      ${thresholds.map(t => `
        <tr>
          <td>${t.sensorType}</td><td>${t.comparator}</td><td>${t.value}</td><td>${(t.actions||[]).join(", ")}</td><td>${t.enabled?"Yes":"No"}</td>
          <td>
            <form method="post" action="/api/thresholds/${t._id}?_method=DELETE" style="display:inline;">
              <button class="btn-red" type="submit">Xóa</button>
            </form>
          </td>
        </tr>`).join("")}
    </tbody>
  </table>

  <h3 style="margin-top:20px;">Thêm ngưỡng</h3>
  <form method="post" action="/api/thresholds">
    <input name="sensorType" placeholder="sensorType (temp/humidity/...)" required />
    <input name="comparator" placeholder="comparator (>,<,>=,<=,==)" required />
    <input name="value" type="number" step="any" placeholder="value" required />
    <input name="actions" placeholder='actions (vd: turn_fan_on,turn_fan_off)' />
    <select name="enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select>
    <button class="btn-green" type="submit">Thêm</button>
  </form>
</section>`;
  res.send(layout("Thresholds", req.user, body));
});

// Schedules page
app.get("/schedules", requireAuth, async (req, res) => {
  const schedules = await Schedule.find().lean();
  const body = `
<h1>Lịch bật/tắt</h1>
<section>
  <table>
    <thead><tr><th>Device</th><th>Cron</th><th>Action</th><th>Enabled</th><th>Hành động</th></tr></thead>
    <tbody>
      ${schedules.map(s => `
        <tr>
          <td>${s.deviceId}</td><td>${s.cron}</td><td>${s.action}</td><td>${s.enabled?"Yes":"No"}</td>
          <td>
            <form method="post" action="/api/schedules/${s._id}?_method=DELETE" style="display:inline;">
              <button class="btn-red" type="submit">Xóa</button>
            </form>
          </td>
        </tr>`).join("")}
    </tbody>
  </table>

  <h3 style="margin-top:20px;">Thêm lịch</h3>
  <form method="post" action="/api/schedules">
    <input name="deviceId" placeholder="deviceId" required />
    <input name="cron" placeholder='cron (vd: 0 7 * * *)' required />
    <input name="action" placeholder="action (ON/OFF)" required />
    <select name="enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select>
    <button class="btn-green" type="submit">Thêm</button>
  </form>
</section>`;
  res.send(layout("Schedules", req.user, body));
});

// Users page
app.get("/users", requireAuth, async (req, res) => {
  const users = await User.find().lean();
  const body = `
<h1>Quản lý người dùng</h1>
<section>
  <table>
    <thead><tr><th>Username</th><th>Role</th><th>Permissions</th><th>Hành động</th></tr></thead>
    <tbody>
      ${users.map(u => `
        <tr>
          <td>${u.username}</td><td>${u.role}</td><td>${JSON.stringify(u.permissions||[])}</td>
          <td>
            <form method="post" action="/api/users/${u._id}?_method=PATCH" style="display:inline;">
              <select name="role">
                <option value="guest" ${u.role==="guest"?"selected":""}>Guest</option>
                <option value="admin" ${u.role==="admin"?"selected":""}>Admin</option>
              </select>
              <button class="btn-green" type="submit">Cập nhật</button>
            </form>
            <form method="post" action="/api/users/${u._id}?_method=DELETE" style="display:inline;">
              <button class="btn-red" type="submit">Xóa</button>
            </form>
          </td>
        </tr>`).join("")}
    </tbody>
  </table>

  <h3 style="margin-top:20px;">Thêm người dùng</h3>
  <form method="post" action="/api/users">
    <input name="username" placeholder="username" required />
    <input name="password" placeholder="password" required />
    <select name="role"><option value="guest">Guest</option><option value="admin">Admin</option></select>
    <button class="btn-green" type="submit">Thêm</button>
  </form>
</section>`;
  res.send(layout("Users", req.user, body));
});

// API: Devices
app.get("/api/devices", apiAuth, async (req, res) => {
  const role = req.user.role;
  const devices = await Device.find().lean();
  if (role === "admin") return res.json(devices);
  const allowedIds = (req.user.permissions||[])
    .filter(p => p.resourceType === "device" && p.actions.includes("read"))
    .map(p => p.resourceId);
  res.json(devices.filter(d => allowedIds.includes(d.deviceId)));
});
app.post("/api/devices", apiAuth, async (req, res) => {
  const { deviceId, type, room, on } = req.body;
  const d = await Device.create({ deviceId, type, room, state: { on: on === "true" } });
  res.redirect("/dashboard");
});
app.post("/api/devices/:id/command", apiAuth, async (req, res) => {
  const { id } = req.params; const { cmd } = req.body;
  const device = await Device.findOne({ deviceId: id });
  if (!device) return res.status(404).send("Not found");
  if (req.user.role !== "admin") {
    const allowed = (req.user.permissions||[]).find(p => p.resourceId === id && p.actions.includes("write"));
    if (!allowed) return res.status(403).send("No write permission");
  }
  device.state.on = cmd === "ON";
  await device.save();
  res.redirect("/dashboard");
});
app.delete("/api/devices/:id", apiAuth, async (req, res) => {
  await Device.findOneAndDelete({ deviceId: req.params.id });
  res.redirect("/dashboard");
});

// API: Thresholds
app.get("/api/thresholds", apiAuth, async (req, res) => {
  res.json(await Threshold.find().lean());
});
app.post("/api/thresholds", apiAuth, async (req, res) => {
  const actions = (req.body.actions||"").split(",").map(s => s.trim()).filter(Boolean);
  await Threshold.create({
    sensorType: req.body.sensorType,
    comparator: req.body.comparator,
    value: Number(req.body.value),
    actions,
    enabled: req.body.enabled === "true"
  });
  res.redirect("/thresholds");
});
app.patch("/api/thresholds/:id", apiAuth, async (req, res) => {
  const actions = (req.body.actions||"").split(",").map(s => s.trim()).filter(Boolean);
  const t = await Threshold.findByIdAndUpdate(req.params.id, {
    ...req.body,
    value: req.body.value ? Number(req.body.value) : undefined,
    actions
  }, { new: true });
  res.json(t);
});
app.delete("/api/thresholds/:id", apiAuth, async (req, res) => {
  await Threshold.findByIdAndDelete(req.params.id);
  res.redirect("/thresholds");
});

// API: Schedules
app.get("/api/schedules", apiAuth, async (req, res) => {
  res.json(await Schedule.find().lean());
});
app.post("/api/schedules", apiAuth, async (req, res) => {
  await Schedule.create({
    deviceId: req.body.deviceId,
    cron: req.body.cron,
    action: req.body.action,
    enabled: req.body.enabled === "true"
  });
  res.redirect("/schedules");
});
app.patch("/api/schedules/:id", apiAuth, async (req, res) => {
  const s = await Schedule.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(s);
});
app.delete("/api/schedules/:id", apiAuth, async (req, res) => {
  await Schedule.findByIdAndDelete(req.params.id);
  res.redirect("/schedules");
});

// API: Users
app.get("/api/users", apiAuth, async (req, res) => {
  const users = await User.find().select("username role permissions").lean();
  res.json(users);
});
app.post("/api/users", apiAuth, async (req, res) => {
  const { username, password, role } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await User.create({ username, passwordHash: hash, role, permissions: [] });
  res.redirect("/users");
});
app.patch("/api/users/:id", apiAuth, async (req, res) => {
  const u = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.redirect("/users");
});
app.delete("/api/users/:id", apiAuth, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.redirect("/users");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

