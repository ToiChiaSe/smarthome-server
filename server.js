const express = require("express");
const mongoose = require("mongoose");
const mqtt = require("mqtt");
const { Server } = require("socket.io");
const http = require("http");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const Sensor = require("./models/Sensor");
const DeviceStatus = require("./models/DeviceStatus");
const User = require("./models/User");
const Threshold = require("./models/Threshold");
const Schedule = require("./models/Schedule");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use(session({
  secret: "secret-key",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smarthome",
    collectionName: "sessions"
  }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smarthome";
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("MongoDB connected");
    const admin = await User.findOne({ username: "admin" });
    if (!admin) {
      await new User({ username: "admin", password: "123456", role: "admin" }).save();
      console.log("Seeded admin (admin/123456)");
    }
    const existingTh = await Threshold.findOne();
    if (!existingTh) {
      await new Threshold({
        enabled: false,
        temperature: { min: 18, max: 30, actionTopic: "truong/home/cmd/fan", actionOn: "ON", actionOff: "OFF" },
        humidity: { min: 40, max: 80 },
        light: { min: 50, max: 800 }
      }).save();
      console.log("Seeded default thresholds");
    }
  })
  .catch(err => console.error("MongoDB error:", err.message));

const mqttClient = mqtt.connect("mqtt://test.mosquitto.org:1883");
mqttClient.on("connect", () => {
  console.log("MQTT connected");
  mqttClient.subscribe("truong/home/cambien");
  mqttClient.subscribe("truong/home/status");
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

mqttClient.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());

    if (topic === "truong/home/cambien") {
      io.emit("sensors", [data]);
      await new Sensor({
        deviceId: data.deviceId,
        temperature: data.temperature,
        humidity: data.humidity,
        light: data.light,
        timestamp: new Date()
      }).save();

      const th = await Threshold.findOne();
      if (th?.enabled) {
        const t = data.temperature;
        if (typeof t === "number" && th.temperature?.actionTopic) {
          if (t > th.temperature.max) {
            mqttClient.publish(th.temperature.actionTopic, th.temperature.actionOn || "ON");
            io.emit("autoAction", { reason: "temp_high", value: t, action: th.temperature.actionOn || "ON" });
          } else if (t < th.temperature.min) {
            mqttClient.publish(th.temperature.actionTopic, th.temperature.actionOff || "OFF");
            io.emit("autoAction", { reason: "temp_low", value: t, action: th.temperature.actionOff || "OFF" });
          }
        }
      }

    } else if (topic === "truong/home/status") {
      io.emit("deviceStatus", data);
      await new DeviceStatus({
        deviceId: data.deviceId,
        led1: data.led1,
        led2: data.led2,
        led3: data.led3,
        led4: data.led4,
        fan: data.fan,
        curtainMode: data.curtainMode,
        timestamp: new Date()
      }).save();
    }
  } catch (err) {
    console.error("MQTT msg error:", err.message);
  }
});

io.on("connection", async (socket) => {
  console.log("Client connected");
  const history = await Sensor.find().sort({ timestamp: -1 }).limit(60).lean();
  history.reverse();
  socket.emit("sensorsHistory", history);

  const lastStatus = await DeviceStatus.find().sort({ timestamp: -1 }).limit(1).lean();
  if (lastStatus[0]) socket.emit("deviceStatus", lastStatus[0]);

  const thresholds = await Threshold.findOne().lean();
  socket.emit("thresholds", thresholds || {});

  const schedules = await Schedule.find().sort({ time: 1 }).lean();
  socket.emit("schedules", schedules);

  const users = await User.find().select("-password").lean();
  socket.emit("users", users);
});

app.get("/login", (req, res) => res.sendFile(__dirname + "/public/login.html"));
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const u = await User.findOne({ username });
  if (!u) return res.status(400).send("Sai tài khoản hoặc mật khẩu");
  const ok = await u.comparePassword(password);
  if (!ok) return res.status(400).send("Sai tài khoản hoặc mật khẩu");
  req.session.user = { id: u._id, role: u.role, username: u.username };
  res.redirect("/dashboard.html");
});
app.post("/logout", (req, res) => req.session.destroy(() => res.redirect("/login")));

app.post("/api/cmd", requireAuth, (req, res) => {
  const { topic, cmd } = req.body;
  mqttClient.publish(topic, cmd);
  res.json({ ok: true });
});

app.get("/api/thresholds", requireAuth, async (req, res) => {
  const th = await Threshold.findOne().lean();
  res.json(th || {});
});
app.post("/api/thresholds", requireAdmin, async (req, res) => {
  const payload = req.body;
  let th = await Threshold.findOne();
  if (!th) th = new Threshold(payload);
  else Object.assign(th, payload);
  await th.save();
  io.emit("thresholds", th.toObject());
  res.json({ ok: true });
});

app.get("/api/schedules", requireAuth, async (req, res) => {
  const items = await Schedule.find().lean();
  res.json(items);
});
app.post("/api/schedules", requireAdmin, async (req, res) => {
  const { name, time, topic, cmd, enabled } = req.body;
  const sc = new Schedule({ name, time, topic, cmd, enabled: !!enabled });
  await sc.save();
  io.emit("schedules", await Schedule.find().lean());
  res.json({ ok: true });
});
app.post("/api/schedules/:id/toggle", requireAdmin, async (req, res) => {
  const sc = await Schedule.findById(req.params.id);
  if (!sc) return res.status(404).json({ error: "Not found" });
  sc.enabled = !sc.enabled;
  await sc.save();
  io.emit("schedules", await Schedule.find().lean());
  res.json({ ok: true });
});
app.delete("/api/schedules/:id", requireAdmin, async (req, res) => {
  await Schedule.findByIdAndDelete(req.params.id);
  io.emit("schedules", await Schedule.find().lean());
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  if (req.session.user) res.redirect("/dashboard.html");
  else res.redirect("/login");
});

setInterval(async () => {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const current = `${hh}:${mm}`;
  const items = await Schedule.find({ enabled: true }).lean();
  items.filter(i => i.time === current).forEach(i => {
    mqttClient.publish(i.topic, i.cmd);
    io.emit("scheduleAction", { name: i.name, time: i.time, cmd: i.cmd });
  });
}, 10 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server http://localhost:${PORT}`));
