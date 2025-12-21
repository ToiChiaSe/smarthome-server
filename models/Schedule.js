const mongoose = require("mongoose");

const ScheduleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  time: { type: String, required: true }, // "HH:MM"
  topic: { type: String, required: true },
  cmd: { type: String, required: true },
  enabled: { type: Boolean, default: true }
}, { versionKey: false });

module.exports = mongoose.model("Schedule", ScheduleSchema);
