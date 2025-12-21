import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mqtt from "mqtt";
import bodyParser from "body-parser";
import path from "path";
import http from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";

const PORT = process.env.PORT || 3000;
const DB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/smarthome";
const JWT_SECRET = process.env.JWT_SECRET || "secret";
const MQTT_URL = process.env.MQTT_URL || "mqtt://test.mosquitto.org:1883";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== Models ======
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  passwordHash: String,
  role: { type: String, default: "admin" }
});
const User = mongoose.model("User", userSchema);

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, unique: true },
  state: { type: Object }
});
const Device = mongoose.model("Device", deviceSchema);

const thresholdSchema = new mongoose.Schema({
  sensorType: String,
  comparator: String,
  value: Number,
  actions: [String],
  timeStart: String,
  timeEnd: String
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

// ====== Express + Socket.IO ======
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// auth helpers
function getToken(req) {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map(s => s.trim());
  const kv = parts.find(p => p.startsWith("token="));
  return kv ? kv.split("=",2)[1] : null;
}
function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.sendFile(path.join(__dirname,"public/login.html"));
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.sendFile(path.join(__dirname,"public/login.html"));
  }
}

// ====== Routes ======
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.send("Sai tài khoản");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.send("Sai mật khẩu");
  const token = jwt.sign({ username, role: user.role }, JWT_SECRET);
  res.setHeader("Set-Cookie", `token=${token}; HttpOnly; Path=/`);
  res.redirect("/dashboard.html");
});
app.post("/logout", (req, res) => {
  res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0");
  res.redirect("/login.html");
});

// devices command
app.post("/api/devices/:id/command", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { cmd } = req.body;
  let device = await Device.findOne({ deviceId: id });
  if (!device) return res.redirect("/dashboard.html");
  if (id === "curtain") device.state = { mode: cmd };
  else device.state = { on: cmd === "ON" };
  await device.save();
  mqttClient.publish(`truong/home/cmd/${id}`, cmd);
  io.emit("devices", await Device.find().lean());
  res.redirect("/dashboard.html");
});

// thresholds
app.post("/api/thresholds", requireAuth, async (req, res) => {
  const { sensorType, comparator, value, actions, timeStart, timeEnd } = req.body;
  await Threshold.create({
    sensorType, comparator, value: Number(value),
    actions: actions.split(",").map(s=>s.trim()),
    timeStart: timeStart || "", timeEnd: timeEnd || ""
  });
  io.emit("thresholds", await Threshold.find().lean());
  res.redirect("/dashboard.html");
});
app.post("/api/thresholds/:id/delete", requireAuth, async (req, res) => {
  await Threshold.findByIdAndDelete(req.params.id);
  io.emit("thresholds", await Threshold.find().lean());
  res.redirect("/dashboard.html");
});

// schedules
app.post("/api/schedules", requireAuth, async (req, res) => {
  const { deviceId, cron, action } = req.body;
  await Schedule.create({ deviceId, cron, action });
  io.emit("schedules", await Schedule.find().lean());
  res.redirect("/dashboard.html");
});
app.post("/api/schedules/:id/delete", requireAuth, async (req, res) => {
  await Schedule.findByIdAndDelete(req.params.id);
  io.emit("schedules", await Schedule.find().lean());
  res.redirect("/dashboard.html");
});

// OTA upload
const upload = multer({ dest: path.join(__dirname, "firmware") });
app.post("/api/firmware", requireAuth, upload.single("fw"), (req, res) => {
  if (!req.file) return res.send("Không có file");
  console.log("Firmware uploaded:", req.file.filename);
  res.redirect("/dashboard.html");
});
app.get("/firmware/latest", (req, res) => {
  const dir = path.join(__dirname, "firmware");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  if (!files.length) return res.status(404).send("No firmware");
  const latest = files[files.length-1];
  res.sendFile(path.join(dir, latest));
});

// ====== Socket.IO ======
io.on("connection", async (socket) => {
  socket.emit("devices", await Device.find().lean());
  socket.emit("sensors", await Sensor.find().sort({timestamp:-1}).limit(60).lean());
  socket.emit("thresholds", await Threshold.find().lean());
  socket.emit("schedules", await Schedule.find().lean());
});

// ====== MQTT ======
const mqttClient = mqtt.connect(MQTT_URL);
mqttClient.on("connect", () => {
  console.log("MQTT connected:", MQTT_URL);
  mqttClient.subscribe("truong/home/cambien");
  mqttClient.subscribe("truong/home/status");
});
function inTimeWindow(timeStart, timeEnd, d = new Date()) {
  if (!timeStart && !timeEnd) return true;
  const pad = n => String(n).padStart(2,"0");
  const nowStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (timeStart && !timeEnd) return nowStr >= timeStart;
  if (!timeStart && timeEnd) return nowStr <= timeEnd;
  if (timeStart && timeEnd) return (timeStart <= nowStr && nowStr <= timeEnd);
  return true;
}
mqttClient.on("message", async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    if (topic === "truong/home/cambien") {
      const { nhietdo, doam, anhSang } = payload;
      if (typeof nhietdo === "number") await Sensor.create({ sensorType: "temperature", value: nhietdo });
      if (typeof doam === "number") await Sensor.create({ sensorType: "humidity", value: doam });
      if (typeof anhSang === "number") await Sensor.create({ sensorType: "lux", value: anhSang });
      const thresholds = await Threshold.find();
      for (const th of thresholds) {
        let sensorVal;
        if (th.sensorType === "temperature") sensorVal = nhietdo;
        if (th.sensorType === "humidity") sensorVal = doam;
        if (th.sensorType === "lux") sensorVal = anhSang;
        if (sensorVal === undefined) continue;

        if (!inTimeWindow(th.timeStart, th.timeEnd)) continue;

        const condition =
          (th.comparator === ">" && sensorVal > th.value) ||
          (th.comparator === "<" && sensorVal < th.value);

        if (condition) {
          for (const act of th.actions) {
            const [dev, cmd] = act.split(":");
            await Device.updateOne(
              { deviceId: dev },
              { $set: { state: dev === "curtain" ? { mode: cmd } : { on: (cmd === "ON") } } }
            );
            mqttClient.publish(`truong/home/cmd/${dev}`, cmd);
          }
        }
      }

      // emit sensors and devices after inserts/auto actions
      const sensors = await Sensor.find().sort({ timestamp: -1 }).limit(60);
      io.emit("sensors", sensors);
      io.emit("devices", await Device.find());
    }

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
      io.emit("devices", await Device.find().lean());
    }
  } catch (e) {
    console.error("MQTT parse error:", e);
  }
});

// ====== MongoDB Connect ======
mongoose.connect(DB_URI, { dbName: "smarthome" })
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

// ====== Seed admin & devices ======
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
    { deviceId: "fan",  state: { on: false } },
    { deviceId: "curtain", state: { mode: "STOP" } }
  ];
  for (const d of defaults) {
    const existsDev = await Device.findOne({ deviceId: d.deviceId });
    if (!existsDev) await Device.create(d);
  }
})();

// ====== Start server ======
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
