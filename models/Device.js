const mongoose = require("mongoose");
const deviceSchema = new mongoose.Schema({
  deviceId: String,
  state: {}
});
module.exports = mongoose.model("Device", deviceSchema);

