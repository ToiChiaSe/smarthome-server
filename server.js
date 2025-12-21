import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import deviceRoutes from "./routes/devices.js";
import thresholdRoutes from "./routes/thresholds.js";
import scheduleRoutes from "./routes/schedules.js";
import { requireAuth } from "./middleware/auth.js";
import Device from "./models/Device.js";
import Threshold from "./models/Threshold.js";
import Schedule from "./models/Schedule.js";
import User from "./models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// đọc từ biến môi trường Render
const PORT = process.env.PORT || 8080;
const DB_URI = process.env.DB_URI;
mongoose.connect(DB_URI, { dbName: "smarthome" });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/thresholds", thresholdRoutes);
app.use("/api/schedules", scheduleRoutes);

// Views
app.get("/", (req, res) => res.redirect("/login"));
app.get("/login", (req, res) => res.render("login"));

app.get("/dashboard", requireAuth, async (req, res) => {
  const devices = await Device.find().lean();
  res.render("dashboard", { user: req.user, devices });
});

app.get("/thresholds", requireAuth, async (req, res) => {
  const thresholds = await Threshold.find().lean();
  res.render("thresholds", { user: req.user, thresholds });
});

app.get("/schedules", requireAuth, async (req, res) => {
  const schedules = await Schedule.find().lean();
  res.render("schedules", { user: req.user, schedules });
});

app.get("/users", requireAuth, async (req, res) => {
  const users = await User.find().lean();
  res.render("users", { user: req.user, users });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

