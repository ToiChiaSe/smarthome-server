const express = require("express");
const mongoose = require("mongoose");
const mqtt = require("mqtt");
const { Server } = require("socket.io");
const http = require("http");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const Sensor = require("./models/Sensor");

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

// MongoDB connect
const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smarthome";
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

// MQTT connect
const mqttClient = mqtt.connect("mqtt://test.mosquitto.org:1883");
mqttClient.on("connect", () => {
  console.log("MQTT connected");
  mqttClient.subscribe("truong/home/cambien");
  mqttClient.subscribe("truong/home/status");
});

// MQTT message handler
mqttClient.on("message", async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    if (topic === "truong/home/cambien") {
      // Emit ngay cho dashboard
      io.emit("sensors", [data]);
      // Lưu vào DB
      await new Sensor({
        deviceId: data.deviceId,
        temperature: data.temperature,
        humidity: data.humidity,
        light: data.light,
        timestamp: new Date()
      }).save();
    } else if (topic === "truong/home/status") {
      io.emit("deviceStatus", data);
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
});

// Socket.IO
io.on("connection", async (socket) => {
  console.log("Client connected");
  const history = await Sensor.find().sort({ timestamp: -1 }).limit(60).lean();
  history.reverse();
  socket.emit("sensorsHistory", history);
});

// API để gửi lệnh MQTT từ dashboard
app.post("/api/cmd", (req, res) => {
  const { topic, cmd } = req.body;
  const payload = JSON.stringify({ topic, cmd });
  mqttClient.publish(topic, cmd);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server chạy tại http://localhost:${PORT}`));
