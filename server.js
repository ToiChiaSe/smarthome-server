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
    const existingTh = await Threshold.find();
    if (existingTh.length === 0) {
      await Threshold.insertMany([
        {
          enabled: false,
          device: "fan",
          date: null,
          timeStart: null,
          timeEnd: null,
          thresholds: {
            temperature: { min: 18, max: 30 },
            humidity: { min: 40, max: 80 },
            light: { min: 50, max: 800 }
          },
          actionMax: "OFF",
          actionMin: "ON"
        }
      ]);
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

// Helper: ánh xạ thiết bị sang topic
function getTopicByDevice(device) {
  switch (device) {
    case "fan": return "truong/home/cmd/fan";
    case "led1": return "truong/home/cmd/led1";
    case "led2": return "truong/home/cmd/led2";
    case "led3": return "truong/home/cmd/led3";
    case "led4": return "truong/home/cmd/led4";
    case "curtain": return "truong/home/cmd/curtain";
    default: return null;
  }
}

// Middleware kiểm tra đăng nhập & quyền admin
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

      const thresholds = await Threshold.find({ enabled: true }).lean();
      for (const th of thresholds) {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false
        });
        const [hh, mm] = formatter.format(now).split(":");
        const currentMinutes = parseInt(hh) * 60 + parseInt(mm);

        let timeOk = true;
        if (th.timeStart && th.timeEnd) {
          const [sh, sm] = th.timeStart.split(":").map(Number);
          const [eh, em] = th.timeEnd.split(":").map(Number);
          const startMinutes = sh * 60 + sm;
          const endMinutes = eh * 60 + em;
          timeOk = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        }

        if (th.date) {
          const today = now.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
            .split("/").reverse().join("-");
          timeOk = timeOk && (today === th.date);
        }

        if (timeOk) {
          const checks = [];
          const pushCheck = (sensorName, value, bounds) => {
            if (typeof value !== "number" || !bounds) return;
            const { min, max } = bounds;
            if (typeof max === "number" && value > max) {
              checks.push({ sensorName, trigger: "max", value });
            } else if (typeof min === "number" && value < min) {
              checks.push({ sensorName, trigger: "min", value });
            }
          };
          pushCheck("temperature", data.temperature, th.thresholds?.temperature);
          pushCheck("humidity", data.humidity, th.thresholds?.humidity);
          pushCheck("light", data.light, th.thresholds?.light);

          if (checks.length > 0) {
            const hasMax = checks.some(c => c.trigger === "max");
            const action = hasMax ? th.actionMax : th.actionMin;
            const topicOut = getTopicByDevice(th.device);
            if (topicOut && action) {
              mqttClient.publish(topicOut, action);
              io.emit("autoAction", {
                device: th.device,
                reason: hasMax ? "threshold_max" : "threshold_min",
                value: checks.map(c => `${c.sensorName}:${c.value}`).join(","),
                action
              });
            }
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

  const thresholds = await Threshold.find().lean();
  socket.emit("thresholds", thresholds);

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

app.post("/api/cmd", requireAuth, async (req, res) => {
  const { topic, cmd } = req.body;
  const user = await User.findById(req.session.user.id).lean();

  // kiểm tra quyền thiết bị
  const device = topic.split("/").pop(); // ví dụ: fan, led1...
  if (user.role !== "admin" && (!user.allowedDevices || !user.allowedDevices.includes(device))) {
    return res.status(403).json({ error: "Not allowed to control this device" });
  }

  mqttClient.publish(topic, cmd);
  res.json({ ok: true });
});


// Thresholds API
app.get("/api/thresholds", requireAuth, async (req, res) => {
  const ths = await Threshold.find().lean();
  res.json(ths);
});

app.post("/api/thresholds", requireAuth, async (req, res) => {
  const payload = req.body;
  const user = await User.findById(req.session.user.id).lean();

  if (user.role !== "admin" && (!user.allowedDevices || !user.allowedDevices.includes(payload.device))) {
    return res.status(403).json({ error: "Not allowed to set auto mode for this device" });
  }

  const th = new Threshold(payload);
  await th.save();
  io.emit("thresholds", await Threshold.find().lean());
  res.json({ ok: true });
});


// Schedules API
app.get("/api/schedules", requireAuth, async (req, res) => {
  const items = await Schedule.find().lean();
  res.json(items);
});

app.post("/api/schedules", requireAdmin, async (req, res) => {
  const { name, date, time, device, cmd, enabled } = req.body;
  const topic = getTopicByDevice(device);
  if (!topic) return res.status(400).json({ error: "Invalid device" });

  const sc = new Schedule({
    name,
    date: date || null,
    time,
    device,
    topic,
    cmd,
    enabled: !!enabled
  });
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
// ====== User management API ======

// Lấy danh sách người dùng (admin mới được xem)
app.get("/api/users", requireAdmin, async (req, res) => {
  const users = await User.find().select("-password").lean();
  res.json(users);
});

// Thêm người dùng mới
app.post("/api/users", requireAdmin, async (req, res) => {
  const { username, password, role, allowedDevices } = req.body;
  const existing = await User.findOne({ username });
  if (existing) return res.status(400).json({ error: "User already exists" });

  const u = new User({
    username,
    password,
    role: role || "user",
    allowedDevices: allowedDevices || [] // danh sách thiết bị được phép điều khiển
  });
  await u.save();
  io.emit("users", await User.find().select("-password").lean());
  res.json({ ok: true });
});

// Sửa thông tin người dùng
app.put("/api/users/:id", requireAdmin, async (req, res) => {
  const { role, allowedDevices } = req.body;
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: "Not found" });

  if (role) u.role = role;
  if (allowedDevices) u.allowedDevices = allowedDevices;
  await u.save();
  io.emit("users", await User.find().select("-password").lean());
  res.json({ ok: true });
});

// Xóa người dùng
app.delete("/api/users/:id", requireAdmin, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  io.emit("users", await User.find().select("-password").lean());
  res.json({ ok: true });
});
// ====== Schedule runner ======
setInterval(async () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const [hh, mm] = formatter.format(now).split(":");
  const current = `${hh}:${mm}`;
  const today = now.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    .split("/").reverse().join("-");

  const items = await Schedule.find({ enabled: true }).lean();
  items
    .filter(i => i.time === current)
    .filter(i => !i.date || i.date === today)
    .forEach(i => {
      mqttClient.publish(i.topic, i.cmd);
      io.emit("scheduleAction", {
        name: i.name,
        date: i.date || null,
        time: i.time,
        cmd: i.cmd
      });
    });
}, 10 * 1000);

// ====== Start server ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server http://localhost:${PORT}`));
