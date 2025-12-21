const mongoose = require("mongoose");

const DeviceStatusSchema = new mongoose.Schema({
  deviceId: { type: String },
  led1: { type: Boolean },
  led2: { type: Boolean },
  led3: { type: Boolean },
  led4: { type: Boolean },
  fan: { type: Boolean },
  curtainMode: { type: Number }, // 0=STOP,1=CLOSE,2=OPEN
  timestamp: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model("DeviceStatus", DeviceStatusSchema);

