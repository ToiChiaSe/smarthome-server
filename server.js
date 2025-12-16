require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const mqtt = require("mqtt");
const path = require("path");
const cron = require("node-cron");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// =====================================
// 1. CONFIG
// =====================================
const MONGODB_URI = process.env.MONGODB_URI;
const MQTT_URL    = process.env.MQTT_URL || "mqtt://test.mosquitto.org:1883";
const PORT        = process.env.PORT || 3000;
const JWT_SECRET  = process.env.JWT_SECRET || "truong-secret";

// =====================================
// 3. MODELS
// =====================================

// Dữ liệu cảm biến
const CamBien = mongoose.model("CamBien", new mongoose.Schema({
  nhietdo: Number,
  doam: Number,
  anhSang: Number
}, { timestamps: true }));

// Trạng thái thiết bị
const TrangThai = mongoose.model("TrangThai", new mongoose.Schema({
  led1: Boolean,
  led2: Boolean,
  led3: Boolean,
  led4: Boolean,
  fan: Boolean,
  curtainMode: Number,
  encRem: Number,
  encQuat: Number,
  fanRPM: Number,
  fanRunning: Boolean,
  curtainPercent: Number,
  curtainRunning: Boolean,
  autoMode: Boolean,
  lastAction: String
}, { timestamps: true }));

// Auto Mode config – NGƯỠNG THEO CẢM BIẾN + DANH SÁCH RULE
// Mỗi rule trong autoDevices:
//   device: "fan" | "curtain" | "led1" | "led2" | "led3" | "led4"
//   sensor: "temp" | "light" | "humidity"
//   mode: "above" (>= max) | "below" (<= min)
//   action: "ON" | "OFF" | "OPEN" | "CLOSE" | "STOP"
const AutoConfig = mongoose.model("AutoConfig", new mongoose.Schema({
  tempMax: Number,
  tempMin: Number,
  lightMax: Number,
  lightMin: Number,
  humidityMax: Number,
  humidityMin: Number,

  autoMode: Boolean,
  activeFrom: String,  // "HH:mm"
  activeTo: String,    // "HH:mm"

  autoDevices: [
    {
      device: String,
      sensor: String,
      mode: String,
      action: String
    }
  ]
}, { timestamps: true }));

// Schedule
const Schedule = mongoose.model("Schedule", new mongoose.Schema({
  device: String,
  action: String,
  time: String,
  repeat: String
}, { timestamps: true }));

// Scenario (mở rộng điều kiện)
const Scenario = mongoose.model("Scenario", new mongoose.Schema({
  name: String,
  condition: {
    tempAbove: Number,
    tempBelow: Number,
    lightAbove: Number,
    lightBelow: Number,
    humidityAbove: Number,
    humidityBelow: Number
  },
  actions: [{
    device: String,
    cmd: String
  }]
}, { timestamps: true }));

// User
const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true },
  passwordHash: String,
  role: { type: String, enum: ["admin", "user"], default: "user" }
}, { timestamps: true }));

// Log lịch sử AutoMode
const AutoLog = mongoose.model("AutoLog", new mongoose.Schema({
  rule: String,       // tên rule, ví dụ: FAN_TEMP_HIGH
  action: String,     // lệnh gửi, ví dụ: "ON", "OFF", "OPEN", "CLOSE"
  value: Number,      // giá trị điều kiện (ví dụ: nhiệt độ tại thời điểm kích hoạt)
  extra: Object,      // có thể chứa thêm sensor/status
  timestamp: { type: Date, default: Date.now }
}));

// =====================================
// 2. KẾT NỐI MONGODB + AUTO CREATE ADMIN
// =====================================
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log("MongoDB connected");

    try {
      const admin = await User.findOne({ role: "admin" });
      if (!admin) {
        const hash = await bcrypt.hash("123456", 10);
        await User.create({
          username: "admin",
          passwordHash: hash,
          role: "admin"
        });
        console.log("Admin created automatically: admin / 123456");
      } else {
        console.log("Admin already exists");
      }
    } catch (err) {
      console.error("AUTO ADMIN ERROR:", err.message);
    }
  })
  .catch(err => console.error("MongoDB error:", err.message));

// =====================================
// 4. MQTT CONNECT
// =====================================
const mqttClient = mqtt.connect(MQTT_URL);

mqttClient.on("connect", () => {
  console.log("MQTT connected:", MQTT_URL);
  mqttClient.subscribe("truong/home/cambien");
  mqttClient.subscribe("truong/home/status");
});

mqttClient.on("error", (err) => {
  console.error("MQTT error:", err.message);
});

// Nhận dữ liệu từ ESP32
mqttClient.on("message", async (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    if (data.deviceId && data.deviceId !== "esp32-001") return;
    delete data.deviceId;

    if (topic === "truong/home/cambien") {
      await CamBien.create(data);
      console.log("Saved sensor:", data);
    }

    if (topic === "truong/home/status") {
      await TrangThai.findOneAndUpdate({}, data, { upsert: true });
      console.log("Updated status:", data);
    }

  } catch (err) {
    console.error("MQTT message error:", err.message);
  }
});

// =====================================
// 5. AUTH & PHÂN QUYỀN
// =====================================
function signToken(user) {
  return jwt.sign(
    { id: user._id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authMiddleware(requiredRole) {
  return (req, res, next) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "No token" });

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;
      if (requiredRole && payload.role !== requiredRole) {
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    } catch (err) {
      return res.status(401).json({ error: "Invalid token" });
    }
  };
}

// Đăng ký
app.post("/api/auth/register", async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: "Thiếu username hoặc password" });
  }

  const hash = await bcrypt.hash(password, 10);
  try {
    const user = await User.create({ username, passwordHash: hash, role: role || "user" });
    res.json({ success: true, user: { username: user.username, role: user.role } });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Đăng nhập
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });

  const token = signToken(user);
  res.json({ token, role: user.role });
});

// =====================================
// 6. AUTO MODE ENGINE (THEO NGƯỠNG RIÊNG + DANH SÁCH RULE)
// =====================================

// Helper kiểm tra thời gian trong khoảng activeFrom - activeTo
function isTimeInRange(from, to) {
  if (!from || !to) return true; // nếu không cấu hình thì luôn true

  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();

  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);

  const start = fh * 60 + fm;
  const end   = th * 60 + tm;

  return cur >= start && cur <= end;
}

// Hàm chuẩn hóa giờ HH:mm
function fixTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  if (!h || !m) return "";
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

// autoEngine mới: chạy theo danh sách rule trong autoDevices
async function autoEngine() {
  try {
    const config = await AutoConfig.findOne().sort({ createdAt: -1 });
    if (!config || !config.autoMode) return;

    // Kiểm tra thời gian hoạt động
    if (!isTimeInRange(config.activeFrom, config.activeTo)) return;

    const sensor = await CamBien.findOne().sort({ createdAt: -1 });
    const status = await TrangThai.findOne();
    if (!sensor || !status) return;

    const rules = config.autoDevices || [];
    if (!rules.length) return;

    for (const rule of rules) {
      let value = null;
      let min = null;
      let max = null;

      // Chọn cảm biến
      if (rule.sensor === "temp") {
        value = sensor.nhietdo;
        min = config.tempMin;
        max = config.tempMax;
      } else if (rule.sensor === "light") {
        value = sensor.anhSang;
        min = config.lightMin;
        max = config.lightMax;
      } else if (rule.sensor === "humidity") {
        value = sensor.doam;
        min = config.humidityMin;
        max = config.humidityMax;
      }

      if (value == null) continue;

      let trigger = false;

      // mode = "above" -> kích khi >= max
      if (rule.mode === "above" && max != null && value >= max) {
        trigger = true;
      }

      // mode = "below" -> kích khi <= min
      if (rule.mode === "below" && min != null && value <= min) {
        trigger = true;
      }

      if (!trigger) continue;

      const topic = "truong/home/cmd/" + rule.device;
      const cmd = String(rule.action);

      mqttClient.publish(topic, cmd);
      console.log("AUTO ENGINE CMD:", topic, cmd, "value:", value);

      await AutoLog.create({
        rule: `${rule.device}_${rule.sensor}_${rule.mode}`,
        action: cmd,
        value,
        extra: {
          nhietdo: sensor.nhietdo,
          doam: sensor.doam,
          anhSang: sensor.anhSang
        }
      });
    }
  } catch (err) {
    console.error("AUTO ENGINE ERROR:", err.message);
  }
}

setInterval(autoEngine, 5000);

// =====================================
// 7. SCENARIO ENGINE (NÂNG CAO)
// =====================================
async function scenarioEngine() {
  try {
    const sensor = await CamBien.findOne().sort({ createdAt: -1 });
    if (!sensor) return;

    const scenarios = await Scenario.find({});
    for (const sc of scenarios) {
      const c = sc.condition || {};
      let ok = true;

      if (c.tempAbove != null && !(sensor.nhietdo > c.tempAbove)) ok = false;
      if (c.tempBelow != null && !(sensor.nhietdo < c.tempBelow)) ok = false;
      if (c.lightAbove != null && !(sensor.anhSang > c.lightAbove)) ok = false;
      if (c.lightBelow != null && !(sensor.anhSang < c.lightBelow)) ok = false;
      if (c.humidityAbove != null && !(sensor.doam > c.humidityAbove)) ok = false;
      if (c.humidityBelow != null && !(sensor.doam < c.humidityBelow)) ok = false;

      if (!ok) continue;

      console.log("SCENARIO TRIGGERED:", sc.name);
      for (const a of (sc.actions || [])) {
        const topic = "truong/home/cmd/" + a.device;
        mqttClient.publish(topic, a.cmd);
        await AutoLog.create({
          rule: "SCENARIO_" + sc.name,
          action: `${a.device}:${a.cmd}`,
          value: null,
          extra: {
            nhietdo: sensor.nhietdo,
            doam: sensor.doam,
            anhSang: sensor.anhSang
          }
        });
      }
    }
  } catch (err) {
    console.error("SCENARIO ENGINE ERROR:", err.message);
  }
}

setInterval(scenarioEngine, 7000);

// =====================================
// 8. SCHEDULE ENGINE (GIỮ LOGIC)
// =====================================
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${hh}:${mm}`;

    const schedules = await Schedule.find({ time: currentTime });
    for (const sch of schedules) {
      let { device, action } = sch;

      // Nếu device là curtain và action là ON/OFF -> map sang OPEN/CLOSE
      if (device === "curtain") {
        if (action === "ON") action = "OPEN";
        if (action === "OFF") action = "CLOSE";
      }

      const topic = "truong/home/cmd/" + device;
      mqttClient.publish(topic, action);

      if (sch.repeat === "once") {
        await Schedule.findByIdAndDelete(sch._id);
      }
    }
  } catch (err) {
    console.error("SCHEDULE ERROR:", err.message);
  }
});

// =====================================
// 9. API CẢM BIẾN
// =====================================
app.get("/api/cambien/latest", async (req, res) => {
  const doc = await CamBien.findOne().sort({ createdAt: -1 });
  res.json(doc || {});
});

app.get("/api/cambien/recent", async (req, res) => {
  const docs = await CamBien.find().sort({ createdAt: -1 }).limit(10);
  res.json(docs);
});

// =====================================
// 10. API TRẠNG THÁI
// =====================================
app.get("/api/trangthai/latest", async (req, res) => {
  const doc = await TrangThai.findOne();
  res.json(doc || {});
});

// =====================================
// 11. API AUTO CONFIG (THEO NGƯỠNG RIÊNG + DANH SÁCH RULE)
// =====================================
app.get("/api/auto-config", async (req, res) => {
  const doc = await AutoConfig.findOne().sort({ createdAt: -1 });
  res.json(doc || {});
});

app.post("/api/auto-config", authMiddleware("admin"), async (req, res) => {
  try {
    const {
      tempMin, tempMax,
      lightMin, lightMax,
      humidityMin, humidityMax,
      activeFrom, activeTo,
      autoMode,
      autoDevices   // MẢNG RULE TỪ FRONTEND GỬI LÊN
    } = req.body;

    // ÍT NHẤT phải có 1 ngưỡng
    const hasAnyThreshold =
      tempMin !== "" || tempMax !== "" ||
      lightMin !== "" || lightMax !== "" ||
      humidityMin !== "" || humidityMax !== "";

    if (!hasAnyThreshold) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng nhập ít nhất 1 ngưỡng Auto Mode"
      });
    }

    // Nếu bật AutoMode thì phải có thời gian
    if (autoMode && (!activeFrom || !activeTo)) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng nhập thời gian hoạt động Auto Mode"
      });
    }

    // Chuẩn hóa mảng rule
    const normalizedRules = Array.isArray(autoDevices) ? autoDevices.map(r => ({
      device: r.device,
      sensor: r.sensor,
      mode: r.mode,
      action: r.action
    })) : [];

    const payload = {
      tempMin: tempMin === "" ? null : Number(tempMin),
      tempMax: tempMax === "" ? null : Number(tempMax),
      lightMin: lightMin === "" ? null : Number(lightMin),
      lightMax: lightMax === "" ? null : Number(lightMax),
      humidityMin: humidityMin === "" ? null : Number(humidityMin),
      humidityMax: humidityMax === "" ? null : Number(humidityMax),

      activeFrom: fixTime(activeFrom),
      activeTo: fixTime(activeTo),
      autoMode: !!autoMode,

      autoDevices: normalizedRules
    };

    const existing = await AutoConfig.findOne().sort({ createdAt: -1 });

    if (existing) {
      await AutoConfig.findByIdAndUpdate(existing._id, payload);
      return res.json({ success: true, updated: true });
    }

    await AutoConfig.create(payload);
    res.json({ success: true, created: true });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================
// 12. API SCHEDULE
// =====================================
app.get("/api/schedule", authMiddleware("admin"), async (req, res) => {
  const docs = await Schedule.find().sort({ time: 1 });
  res.json(docs);
});

app.post("/api/schedule", authMiddleware("admin"), async (req, res) => {
  try {
    const doc = await Schedule.create(req.body);
    res.json({ success: true, schedule: doc });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete("/api/schedule/:id", authMiddleware("admin"), async (req, res) => {
  await Schedule.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// =====================================
// 13. API SCENARIO
// =====================================
app.get("/api/scenario", authMiddleware("admin"), async (req, res) => {
  const docs = await Scenario.find().sort({ createdAt: -1 });
  res.json(docs);
});

app.post("/api/scenario", authMiddleware("admin"), async (req, res) => {
  try {
    const doc = await Scenario.create(req.body);
    res.json({ success: true, scenario: doc });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete("/api/scenario/:id", authMiddleware("admin"), async (req, res) => {
  await Scenario.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// =====================================
// 14. API ĐIỀU KHIỂN THIẾT BỊ
// =====================================
app.post("/api/cmd", authMiddleware(), (req, res) => {
  const { topic, cmd } = req.body;
  if (!topic || typeof cmd === "undefined") {
    return res.status(400).json({ success: false, error: "Invalid topic/cmd" });
  }

  mqttClient.publish(topic, String(cmd));
  res.json({ success: true });
});

// =====================================
// 15. API LOG AUTO MODE
// =====================================
app.get("/api/auto-log/latest", authMiddleware("admin"), async (req, res) => {
  const logs = await AutoLog.find().sort({ timestamp: -1 }).limit(50);
  res.json(logs);
});

// =====================================
// 16. STATIC FILES
// =====================================
app.use(express.static(path.join(__dirname, "public")));

// =====================================
// 17. START SERVER
// =====================================
app.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
});
