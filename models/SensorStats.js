const mongoose = require("mongoose");

const SensorStatsSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  tempMin: Number,
  tempMax: Number,
  tempAvg: Number,
  humMin: Number,
  humMax: Number,
  humAvg: Number,
  lightMin: Number,
  lightMax: Number,
  lightAvg: Number
});

module.exports = mongoose.model("SensorStats", SensorStatsSchema);

