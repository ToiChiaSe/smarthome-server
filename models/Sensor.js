const mongoose = require("mongoose");

const SensorSchema = new mongoose.Schema({
  deviceId: { type: String },
  temperature: { type: Number },
  humidity: { type: Number },
  light: { type: Number },
  timestamp: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model("Sensor", SensorSchema);
