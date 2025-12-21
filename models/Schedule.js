const mongoose = require("mongoose");

const ScheduleSchema = new mongoose.Schema({
  name: String,
  date: String,   // yyyy-mm-dd hoặc null
  time: String,   // HH:mm
  device: String, // fan, led1..led4, curtain
  topic: String,  // sẽ tự ánh xạ từ device
  cmd: String,    // ON/OFF hoặc OPEN/CLOSE/STOP
  enabled: Boolean
});

module.exports = mongoose.model("Schedule", ScheduleSchema);
