const mongoose = require("mongoose");
const scheduleSchema = new mongoose.Schema({
  deviceId: String,
  date: String,
  time: String,
  action: String
});
module.exports = mongoose.model("Schedule", scheduleSchema);

