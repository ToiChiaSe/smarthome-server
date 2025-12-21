const express = require("express");
const mongoose = require("mongoose");
const mqtt = require("mqtt");
const { Server } = require("socket.io");
const http = require("http");
const bcrypt = require("bcrypt");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const Device = require("./models/Device");
const Sensor = require("./models/Sensor");
const Threshold = require("./models/Threshold");
const Schedule = require("./models/Schedule");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

// Session lưu trong MongoDB thay vì MemoryStore
app.use(session({
  secret: "secret-key",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/smarthome",
    collectionName: "sessions"
  }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 ngày
}));

// MongoDB connect
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/smarthome";
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB connection error:", err));

// MQTT connect
const client = mqtt.connect("mqtt://localhost:1883");
client.on("connect", () => {
  console.log("MQTT connected");
  client.subscribe("truong/home/cambien");
});
client.on("message", async (topic, message) => {
  const data = JSON.parse(message.toString());
  const sensor = new Sensor(data);
  await sensor.save();
  io.emit("sensors", await Sensor.find().sort({ timestamp: -1 }).limit(60).lean());
});

// Login routes
app.get("/login", (req, res) => {
  res.sendFile(__dirname + "/public/login.html");
});
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && await bcrypt.compare(password, user.password)) {
    req.session.user = { id: user._id, role: user.role };
    res.redirect("/dashboard.html");
  } else {
    res.send("Sai tài khoản hoặc mật khẩu");
  }
});
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// Middleware bảo vệ dashboard
app.use((req, res, next) => {
  if (req.path.startsWith("/dashboard") && !req.session.user) {
    return res.redirect("/login");
  }
  next();
});

// API Users
app.post("/api/users", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const user = new User({ username, password, role });
    await user.save();
    io.emit("users", await User.find().lean());
    res.redirect("/dashboard.html");
  } catch (err) {
    res.status(400).send("Lỗi thêm user: " + err.message);
  }
});
app.post("/api/users/:id/delete", async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    io.emit("users", await User.find().lean());
    res.redirect("/dashboard.html");
  } catch (err) {
    res.status(400).send("Lỗi xóa user: " + err.message);
  }
});

// Socket.IO
io.on("connection", async (socket) => {
  console.log("Client connected");
  socket.emit("devices", await Device.find().lean());
  socket.emit("sensors", await Sensor.find().sort({ timestamp: -1 }).limit(60).lean());
  socket.emit("thresholds", await Threshold.find().lean());
  socket.emit("schedules", await Schedule.find().lean());
  socket.emit("users", await User.find().lean());
});

// Lắng nghe PORT Render cấp
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server chạy tại http://localhost:${PORT}`);
});
