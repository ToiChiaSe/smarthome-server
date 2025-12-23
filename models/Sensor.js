const mongoose = require("mongoose");

const SensorSchema = new mongoose.Schema({
  deviceId: { type: String },
  temperature: { type: Number },
  humidity: { type: Number },
  light: { type: Number },
  timestamp: { type: Date, default: Date.now }
}, { versionKey: false });

SensorSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model("Sensor", SensorSchema);
