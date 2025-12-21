const mongoose = require("mongoose");

const ThresholdSchema = new mongoose.Schema({
  enabled: Boolean,
  device: String,
  date: String,   // yyyy-mm-dd hoặc null
  timeStart: String, // HH:mm
  timeEnd: String,   // HH:mm
  thresholds: {
    temperature: { min: Number, max: Number },
    humidity:    { min: Number, max: Number },
    light:       { min: Number, max: Number }
  },
  actionMax: String,
  actionMin: String
});

module.exports = mongoose.model("Threshold", ThresholdSchema);
