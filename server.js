import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mqtt from "mqtt";
import bodyParser from "body-parser";

const PORT = process.env.PORT || 3000;
const DB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/smarthome";
const JWT_SECRET = process.env.JWT_SECRET || "secret";
const MQTT_URL = process.env.MQTT_URL || "mqtt://test.mosquitto.org:1883";

// ====== Models ======
const userSchema = new mongoose.Schema({
  username: String,
  passwordHash: String,
  role: String,
  permissions: [String]
});
const User = mongoose.model("User", userSchema);

const deviceSchema = new mongoose.Schema({
  deviceId: String,
  state: { type: Object }
});
const Device = mongoose.model("Device", deviceSchema);

const thresholdSchema = new mongoose.Schema({
  sensorType: String,
  comparator: String,
  value: Number,
  actions: [String]
});
const Threshold = mongoose.model("Threshold", thresholdSchema);

const scheduleSchema = new mongoose.Schema({
  deviceId: String,
  cron: String,
  action: String
});
const Schedule = mongoose.model("Schedule", scheduleSchema);

const sensorSchema = new mongoose.Schema({
  sensorType: String,
  value: Number,
  timestamp: { type: Date, default: Date.now }
});
const Sensor = mongoose.model("Sensor", sensorSchema);

// ====== Express ======
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

function layout(title, user, body) {
  return `<!DOCTYPE html>
<html><head><title>${title}</title>
<style>
body { font-family: sans-serif; margin:20px; }
.container { max-width:900px; margin:auto; }
.card { border:1px solid #ccc; padding:20px; margin-bottom:20px; border-radius:8px; }
.btn-green { background:#4CAF50; color:white; border:none; padding:6px 12px; cursor:pointer; border-radius:4px; }
.btn-gray { background:#ccc; border:none; padding:6px 12px; cursor:pointer; border-radius:4px; }
ul { list-style: none; padding-left: 0; }
li { margin-bottom: 8px; }
form { display:inline; margin-right:6px; }
</style></head><body>
<h1>${title}</h1>
${user ? `<p>Xin chào ${user.username} (${user.role})</p>` : ""}
${body}
</body></html>`;
}

function getToken(req) {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map(s => s.trim());
  const kv = parts.find(p => p.startsWith("token="));
  return kv ? kv.split("=",2)[1] : null;
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.redirect("/login");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.redirect("/login");
  }
}

function apiAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).send("Unauthorized");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).send("Unauthorized");
  }
}

// ====== Routes ======

// Login
app.get("/login", (req, res) => {
  const body = `
  <div class="container"><div class="card">
    <h2>Đăng nhập</h2>
    <form method="post" action="/login">
      <input name="username" placeholder="Username" required />
      <input name="password" type="password" placeholder="Password" required />
      <button class="btn-green">Login</button>
    </form>
  </div></div>`;
  res.send(layout("Login", null, body));
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.send("Sai tài khoản");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.send("Sai mật khẩu");
  const token = jwt.sign({ username, role: user.role }, JWT_SECRET);
  res.setHeader("Set-Cookie", `token=${token}; HttpOnly; Path=/`);
  res.redirect("/");
});

// Dashboard
app.get("/", requireAuth, async (req, res) => {
  const devices = await Device.find().lean();
  const body = `
  <div class="container">
    <div class="card">
      <h2>Devices</h2>
      <ul>
        ${devices.map(d=>{
          if(d.deviceId==="curtain"){
            return `
              <li>
                curtain - ${d.state?.mode || "STOP"}
                <form method="post" action="/api/devices/curtain/command">
                  <input type="hidden" name="cmd" value="OPEN"/>
                  <button class="btn-gray">Mở</button>
                </form>
                <form method="post" action="/api/devices/curtain/command">
                  <input type="hidden" name="cmd" value="CLOSE"/>
                  <button class="btn-gray">Đóng</button>
                </form>
                <form method="post" action="/api/devices/curtain/command">
                  <input type="hidden" name="cmd" value="STOP"/>
                  <button class="btn-gray">Ngừng</button>
                </form>
              </li>`;
          }
          if(d.deviceId==="fan"){
            return `
              <li>
                fan - ${d.state?.on ? "ON" : "OFF"}
                <form method="post" action="/api/devices/fan/command">
                  <input type="hidden" name="cmd" value="ON"/>
                  <button class="btn-gray">Bật</button>
                </form>
                <form method="post" action="/api/devices/fan/command">
                  <input type="hidden" name="cmd" value="OFF"/>
                  <button class="btn-gray">Tắt</button>
                </form>
              </li>`;
          }
          return `
            <li>
              ${d.deviceId} - ${d.state?.on ? "ON" : "OFF"}
              <form method="post" action="/api/devices/${d.deviceId}/command">
                <input type="hidden" name="cmd" value="${d.state?.on ? "OFF" : "ON"}"/>
                <button class="btn-gray">${d.state?.on ? "Tắt" : "Bật"}</button>
              </form>
            </li>`;
        }).join("")}
      </ul>
    </div>
  </div>`;
  res.send(layout("Dashboard", req.user, body));
});

// Users
app.get("/users", requireAuth, async (req, res) => {
  const users = await User.find().lean();
  const body = `
  <div class="container"><div class="card">
    <h2>Users</h2>
    <ul>${users.map(u=>`<li>${u.username} (${u.role})</li>`).join("")}</ul>
    <h3>Thêm User</h3>
    <form method="post" action="/api/users">
      <input name="username" placeholder="Username" required />
      <input name="password" type="password" placeholder="Password" required />
      <select name="role">
        <option value="guest">Guest</option>
        <option value="admin">Admin</option>
      </select>
      <button class="btn-green">Thêm</button>
    </form>
  </div></div>`;
  res.send(layout("Users", req.user, body));
});

app.post("/api/users", apiAuth, async (req, res) => {
  const { username, password, role } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await User.create({ username, passwordHash: hash, role });
  res.redirect("/users");
});

// Devices API
app.post("/api/devices/:id/command", apiAuth, async (req, res) => {
  const { id } = req.params;
  const { cmd } = req.body;
  let device = await Device.findOne({ deviceId: id });
  if (!device) return res.redirect("/");

  if (id === "curtain") {
    device.state = { mode: cmd }; // OPEN/CLOSE/STOP
  } else {
    device.state = { on: cmd === "ON" }; // LEDs & fan
      }
  await device.save();

  // Publish lệnh qua MQTT
  mqttClient.publish(`truong/home/cmd/${id}`, cmd);
  res.redirect("/");
});

// ====== Thresholds ======
app.get("/thresholds", requireAuth, async (req, res) => {
  const thresholds = await Threshold.find().lean();
  const body = `
  <div class="container"><div class="card">
    <h2>Thresholds</h2>
    <ul>
      ${thresholds.map(t=>`
        <li>
          ${t.sensorType} ${t.comparator} ${t.value} → ${t.actions.join(",")}
          <form method="post" action="/api/thresholds/${t._id}/delete" style="display:inline;">
            <button class="btn-gray">Xóa</button>
          </form>
        </li>`).join("")}
    </ul>
    <h3>Thêm Threshold</h3>
    <form method="post" action="/api/thresholds">
      <input name="sensorType" placeholder="Sensor type" required />
      <select name="comparator"><option value=">">&gt;</option><option value="<">&lt;</option></select>
      <input name="value" type="number" placeholder="Giá trị" required />
      <input name="actions" placeholder="Hành động, cách nhau bằng dấu phẩy" required />
      <button class="btn-green">Thêm</button>
    </form>
  </div></div>`;
  res.send(layout("Thresholds", req.user, body));
});

app.post("/api/thresholds", apiAuth, async (req, res) => {
  const { sensorType, comparator, value, actions } = req.body;
  await Threshold.create({ sensorType, comparator, value, actions: actions.split(",") });
  res.redirect("/thresholds");
});

app.post("/api/thresholds/:id/delete", apiAuth, async (req, res) => {
  await Threshold.findByIdAndDelete(req.params.id);
  res.redirect("/thresholds");
});

// ====== Schedules ======
app.get("/schedules", requireAuth, async (req, res) => {
  const schedules = await Schedule.find().lean();
  const body = `
  <div class="container"><div class="card">
    <h2>Schedules</h2>
    <ul>
      ${schedules.map(s=>`
        <li>
          ${s.deviceId} ${s.cron} ${s.action}
          <form method="post" action="/api/schedules/${s._id}/delete" style="display:inline;">
            <button class="btn-gray">Xóa</button>
          </form>
        </li>`).join("")}
    </ul>
    <h3>Thêm Schedule</h3>
    <form method="post" action="/api/schedules">
      <input name="deviceId" placeholder="Device ID" required />
      <input name="cron" placeholder="Biểu thức cron" required />
      <input name="action" placeholder="Hành động (ON/OFF)" required />
      <button class="btn-green">Thêm</button>
    </form>
  </div></div>`;
  res.send(layout("Schedules", req.user, body));
});

app.post("/api/schedules", apiAuth, async (req, res) => {
  const { deviceId, cron, action } = req.body;
  await Schedule.create({ deviceId, cron, action });
  res.redirect("/schedules");
});

app.post("/api/schedules/:id/delete", apiAuth, async (req, res) => {
  await Schedule.findByIdAndDelete(req.params.id);
  res.redirect("/schedules");
});
// ====== MQTT + Auto Mode ======
const mqttClient = mqtt.connect(MQTT_URL);
mqttClient.on("connect", () => {
  console.log("MQTT connected:", MQTT_URL);
  mqttClient.subscribe("truong/home/cambien");
  mqttClient.subscribe("truong/home/status");
});

mqttClient.on("message", async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());

    // Nhận dữ liệu cảm biến
    if (topic === "truong/home/cambien") {
      const { nhietdo, doam, anhSang } = payload;
      if (typeof nhietdo === "number") await Sensor.create({ sensorType: "temperature", value: nhietdo });
      if (typeof doam === "number") await Sensor.create({ sensorType: "humidity", value: doam });
      if (typeof anhSang === "number") await Sensor.create({ sensorType: "lux", value: anhSang });

      // Auto mode: kiểm tra ngưỡng
      const thresholds = await Threshold.find();
      for (const th of thresholds) {
        let sensorVal;
        if (th.sensorType === "temperature") sensorVal = nhietdo;
        if (th.sensorType === "humidity") sensorVal = doam;
        if (th.sensorType === "lux") sensorVal = anhSang;
        if (sensorVal === undefined) continue;

        let condition = false;
        if (th.comparator === ">" && sensorVal > th.value) condition = true;
        if (th.comparator === "<" && sensorVal < th.value) condition = true;

        if (condition) {
          for (const act of th.actions) {
            // act dạng "fan:ON" hoặc "curtain:OPEN"
            const [dev, cmd] = act.split(":");
            await Device.updateOne(
              { deviceId: dev },
              { $set: { state: dev==="curtain" ? {mode:cmd} : {on:(cmd==="ON")} } }
            );
            mqttClient.publish(`truong/home/cmd/${dev}`, cmd);
          }
        }
      }
    }

    // Nhận trạng thái thiết bị
    if (topic === "truong/home/status") {
      const { led1, led2, led3, led4, fan, curtainMode } = payload;
      if (typeof led1 === "boolean") await Device.updateOne({ deviceId: "led1" }, { $set: { state: { on: led1 } } });
      if (typeof led2 === "boolean") await Device.updateOne({ deviceId: "led2" }, { $set: { state: { on: led2 } } });
      if (typeof led3 === "boolean") await Device.updateOne({ deviceId: "led3" }, { $set: { state: { on: led3 } } });
      if (typeof led4 === "boolean") await Device.updateOne({ deviceId: "led4" }, { $set: { state: { on: led4 } } });
      if (typeof fan === "boolean") await Device.updateOne({ deviceId: "fan" }, { $set: { state: { on: fan } } });
      if (typeof curtainMode === "number") {
        const mode = curtainMode === 2 ? "OPEN" : curtainMode === 1 ? "CLOSE" : "STOP";
        await Device.updateOne({ deviceId: "curtain" }, { $set: { state: { mode } } });
      }
    }
  } catch (e) {
    console.error("MQTT parse error:", e);
  }
});

// ====== MongoDB Connect ======
mongoose.connect(DB_URI, { dbName: "smarthome" })
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

// ====== Seed admin user & devices ======
(async () => {
  const exists = await User.findOne({ username: "admin" });
  if (!exists) {
    const hash = await bcrypt.hash("123456", 10);
    await User.create({ username: "admin", passwordHash: hash, role: "admin" });
    console.log("Seeded admin user");
  }

  const defaults = [
    { deviceId: "led1", state: { on: false } },
    { deviceId: "led2", state: { on: false } },
    { deviceId: "led3", state: { on: false } },
    { deviceId: "led4", state: { on: false } },
    { deviceId: "fan",  state: { on: false } },        // fan ON/OFF
    { deviceId: "curtain", state: { mode: "STOP" } }   // curtain 3 chế độ
  ];
  for (const d of defaults) {
    const existsDev = await Device.findOne({ deviceId: d.deviceId });
    if (!existsDev) await Device.create(d);
  }
})();

// ====== Start Server ======
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

