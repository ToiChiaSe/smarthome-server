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
  curtainRunning: Boolean
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

app.post("/api/cmd", (req, res) => {
  const { topic, cmd } = req.body;
  mqttClient.publish(topic, cmd);
  res.json({ success: true });
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

