const mongoose = require("mongoose");

const ThresholdSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  temperature: {
    min: Number, max: Number,
    actionTopic: String,
    actionOn: String,
    actionOff: String
  },
  humidity: { min: Number, max: Number },
  light: { min: Number, max: Number }
}, { versionKey: false });

module.exports = mongoose.model("Threshold", ThresholdSchema);
