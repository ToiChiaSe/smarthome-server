require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const mqtt = require("mqtt");
const path = require("path");
const cron = require("node-cron");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();

// =====================================
// 1. CONFIG
// =====================================
const MONGODB_URI = process.env.MONGODB_URI;
const MQTT_URL    = process.env.MQTT_URL;
const PORT        = process.env.PORT || 3000;
const JWT_SECRET  = process.env.JWT_SECRET || "truong-secret";

// =====================================
// 2. KẾT NỐI MONGODB
// =====================================
mongoose.connect(MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err.message));

// =====================================
// 3. SCHEMAS & MODELS
// =====================================

// Dữ liệu cảm biến
const CamBien = mongoose.model("CamBien", new mongoose.Schema({
  nhietdo: Number,
  doam: Number,
  anhSang: Number
}, { timestamps: true }));

// Trạng thái thiết bị (hiện tại)
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

// Cấu hình Auto Mode
const AutoConfig = mongoose.model("AutoConfig", new mongoose.Schema({
  tempMax: Number,
  tempMin: Number,
  lightMax: Number,
  lightMin: Number,
  humidityMax: Number,
  humidityMin: Number,
  autoMode: Boolean
}, { timestamps: true }));

// Lịch bật/tắt thiết bị (Schedule)
const Schedule = mongoose.model("Schedule", new mongoose.Schema({
  device: String,     // led1, led2, fan, curtain
  action: String,     // ON, OFF, OPEN, CLOSE
  time: String,       // HH:mm
  repeat: String      // "once", "daily"
}, { timestamps: true }));

// Kịch bản điều khiển (Scenario)
const Scenario = mongoose.model("Scenario", new mongoose.Schema({
  name: String,
  condition: {         // điều kiện môi trường đơn giản
    tempAbove: Number,
    tempBelow: Number,
    lightAbove: Number,
    lightBelow: Number
  },
  actions: [{          // danh sách hành động
    device: String,    // led1, fan, curtain
    cmd: String        // ON, OFF, OPEN, CLOSE
  }]
}, { timestamps: true }));

// Người dùng
const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, unique: true },
  passwordHash: String,
  role: { type: String, enum: ["admin", "user"], default: "user" }
}, { timestamps: true }));

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

// Đăng ký (có thể dùng tạm để tạo admin, sau muốn thì tắt)
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
// 6. AUTO MODE ENGINE
// =====================================
async function autoEngine() {
  try {
    const config = await AutoConfig.findOne().sort({ createdAt: -1 });
    if (!config || !config.autoMode) return;

    const sensor = await CamBien.findOne().sort({ createdAt: -1 });
    if (!sensor) return;

    // AUTO: Nhiệt độ → quạt
    if (config.tempMax != null && sensor.nhietdo > config.tempMax) {
      mqttClient.publish("truong/home/cmd/fan", "ON");
      console.log("AUTO: Bật quạt do nhiệt độ >", config.tempMax);
    }
    if (config.tempMin != null && sensor.nhietdo < config.tempMin) {
      mqttClient.publish("truong/home/cmd/fan", "OFF");
      console.log("AUTO: Tắt quạt do nhiệt độ <", config.tempMin);
    }

    // AUTO: Ánh sáng → rèm
    if (config.lightMax != null && sensor.anhSang > config.lightMax) {
      mqttClient.publish("truong/home/cmd/curtain", "CLOSE");
      console.log("AUTO: Đóng rèm do ánh sáng >", config.lightMax);
    }
    if (config.lightMin != null && sensor.anhSang < config.lightMin) {
      mqttClient.publish("truong/home/cmd/curtain", "OPEN");
      console.log("AUTO: Mở rèm do ánh sáng <", config.lightMin);
    }

  } catch (err) {
    console.error("AUTO ENGINE ERROR:", err.message);
  }
}

// chạy mỗi 5 giây
setInterval(autoEngine, 5000);

// =====================================
// 7. SCENARIO ENGINE
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

      if (!ok) continue;

      console.log("SCENARIO TRIGGERED:", sc.name);
      (sc.actions || []).forEach(a => {
        const topic = "truong/home/cmd/" + a.device;
        mqttClient.publish(topic, a.cmd);
        console.log("   →", topic, "=", a.cmd);
      });
    }
  } catch (err) {
    console.error("SCENARIO ENGINE ERROR:", err.message);
  }
}

// chạy mỗi 7 giây
setInterval(scenarioEngine, 7000);

// =====================================
// 8. SCHEDULE ENGINE (node-cron)
// =====================================
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const currentTime = `${hh}:${mm}`;

    const schedules = await Schedule.find({ time: currentTime });
    for (const sch of schedules) {
      const topic = "truong/home/cmd/" + sch.device;
      mqttClient.publish(topic, sch.action);
      console.log("SCHEDULE:", sch.device, sch.action, "at", sch.time);

      if (sch.repeat === "once") {
        await Schedule.findByIdAndDelete(sch._id);
      }
    }
  } catch (err) {
    console.error("SCHEDULE ERROR:", err.message);
  }
});

// =====================================
// 9. EXPRESS MIDDLEWARE & STATIC
// =====================================
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// =====================================
// 10. API CẢM BIẾN
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
// 11. API TRẠNG THÁI THIẾT BỊ
// =====================================

app.get("/api/trangthai/latest", async (req, res) => {
  const doc = await TrangThai.findOne();
  res.json(doc || {});
});

// =====================================
// 12. API AUTO MODE CONFIG
// =====================================

// Lấy cấu hình Auto mới nhất
app.get("/api/auto-config", async (req, res) => {
  const doc = await AutoConfig.findOne().sort({ createdAt: -1 });
  res.json(doc || {});
});

// Lưu cấu hình Auto (chỉ admin)
app.post("/api/auto-config", authMiddleware("admin"), async (req, res) => {
  try {
    await AutoConfig.create(req.body);
    res.json({ success: true });
  } catch (err) {
    console.error("AutoConfig error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =====================================
// 13. API SCHEDULE (LỊCH HOẠT ĐỘNG)
// =====================================

// Lấy danh sách lịch (admin)
app.get("/api/schedule", authMiddleware("admin"), async (req, res) => {
  const docs = await Schedule.find().sort({ time: 1 });
  res.json(docs);
});

// Thêm lịch (admin)
app.post("/api/schedule", authMiddleware("admin"), async (req, res) => {
  try {
    const doc = await Schedule.create(req.body);
    res.json({ success: true, schedule: doc });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Xóa lịch (admin)
app.delete("/api/schedule/:id", authMiddleware("admin"), async (req, res) => {
  await Schedule.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// =====================================
// 14. API SCENARIO (KỊCH BẢN)
// =====================================

// Lấy danh sách kịch bản (admin)
app.get("/api/scenario", authMiddleware("admin"), async (req, res) => {
  const docs = await Scenario.find().sort({ createdAt: -1 });
  res.json(docs);
});

// Thêm kịch bản (admin)
app.post("/api/scenario", authMiddleware("admin"), async (req, res) => {
  try {
    const doc = await Scenario.create(req.body);
    res.json({ success: true, scenario: doc });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Xóa kịch bản (admin)
app.delete("/api/scenario/:id", authMiddleware("admin"), async (req, res) => {
  await Scenario.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// =====================================
// 15. API ĐIỀU KHIỂN THIẾT BỊ
// =====================================

// Gửi lệnh MQTT (LED, quạt, rèm, auto,...)
// Cho phép cả user lẫn admin
app.post("/api/cmd", authMiddleware(), (req, res) => {
  const { topic, cmd } = req.body;
  if (!topic || typeof cmd === "undefined") {
    return res.status(400).json({ success: false, error: "Invalid topic/cmd" });
  }

  mqttClient.publish(topic, String(cmd));
  console.log("CMD:", topic, "=>", cmd);
  res.json({ success: true });
});

// =====================================
// 16. START SERVER
// =====================================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
