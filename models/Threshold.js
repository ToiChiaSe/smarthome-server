const mongoose = require("mongoose");

const ThresholdSchema = new mongoose.Schema({
  enabled: Boolean,
  device: String,   // fan, led1..led4, curtain
  date: String,     // yyyy-mm-dd hoặc null
  time: String,     // HH:mm hoặc null
  thresholds: {
    temperature: { min: Number, max: Number },
    humidity:    { min: Number, max: Number },
    light:       { min: Number, max: Number }
  },
  actionMax: String, // ON/OFF hoặc OPEN/CLOSE/STOP
  actionMin: String
});

module.exports = mongoose.model("Threshold", ThresholdSchema);
