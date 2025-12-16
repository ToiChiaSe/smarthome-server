require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const mqtt = require("mqtt");
const path = require("path");

const app = express();

// ====== CONFIG ======
const MONGODB_URI = process.env.MONGODB_URI;
const MQTT_URL = process.env.MQTT_URL;
const PORT = process.env.PORT || 3000;

// ====== CONNECT MONGODB ======
mongoose.connect(MONGODB_URI)
  .then(() => console.log("MongoDB Atlas connected"))
  .catch(err => console.error("MongoDB error:", err.message));

// ====== SCHEMAS ======
const CamBien = mongoose.model("CamBien", new mongoose.Schema({
  nhietdo: Number,
  doam: Number,
  anhSang: Number
}, { timestamps: true }));

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
const AutoConfig = mongoose.model("AutoConfig", new mongoose.Schema({
  tempMax: Number,
  tempMin: Number,
  lightMax: Number,
  lightMin: Number,
  humidityMax: Number,
  humidityMin: Number,
  autoMode: Boolean
}, { timestamps: true }));

// ====== MQTT CONNECT ======
const mqttClient = mqtt.connect(MQTT_URL);

mqttClient.on("connect", () => {
  console.log("MQTT connected");
  mqttClient.subscribe("truong/home/cambien");
  mqttClient.subscribe("truong/home/status");
});

mqttClient.on("message", async (topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    if (data.deviceId !== "esp32-001") return;

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
    console.error("MQTT error:", err.message);
  }
});

// ====== AUTO MODE ENGINE ======
async function autoEngine() {
  try {
    const config = await AutoConfig.findOne().sort({ createdAt: -1 });
    if (!config || !config.autoMode) return;

    const sensor = await CamBien.findOne().sort({ createdAt: -1 });
    if (!sensor) return;

    // ====== AUTO: Nhiệt độ ======
    if (sensor.nhietdo > config.tempMax) {
      mqttClient.publish("truong/home/cmd/fan", "ON");
      console.log("AUTO: Bật quạt do nhiệt độ cao");
    }

    if (sensor.nhietdo < config.tempMin) {
      mqttClient.publish("truong/home/cmd/fan", "OFF");
      console.log("AUTO: Tắt quạt do nhiệt độ thấp");
    }

    // ====== AUTO: Ánh sáng ======
    if (sensor.anhSang > config.lightMax) {
      mqttClient.publish("truong/home/cmd/curtain", "CLOSE");
      console.log("AUTO: Đóng rèm do ánh sáng mạnh");
    }

    if (sensor.anhSang < config.lightMin) {
      mqttClient.publish("truong/home/cmd/curtain", "OPEN");
      console.log("AUTO: Mở rèm do ánh sáng yếu");
    }

  } catch (err) {
    console.error("AUTO ENGINE ERROR:", err.message);
  }
}

// chạy mỗi 5 giây
setInterval(autoEngine, 5000);

// ====== EXPRESS API ======
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/cambien/latest", async (req, res) => {
  const doc = await CamBien.findOne().sort({ createdAt: -1 });
  res.json(doc || {});
});

app.get("/api/cambien/recent", async (req, res) => {
  const docs = await CamBien.find().sort({ createdAt: -1 }).limit(10);
  res.json(docs);
});

app.get("/api/trangthai/latest", async (req, res) => {
  const doc = await TrangThai.findOne();
  res.json(doc || {});
});
app.get("/api/auto-config", async (req, res) => {
  const doc = await AutoConfig.findOne().sort({ createdAt: -1 });
  res.json(doc || {});
});
app.post("/api/auto-config", async (req, res) => {
  await AutoConfig.create(req.body);
  res.json({ success: true });
});

// ====== Điều khiển thiết bị ======
app.post("/api/cmd", (req, res) => {
  const { topic, cmd } = req.body;
  mqttClient.publish(topic, cmd);
  res.json({ success: true });
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
