const mongoose = require("mongoose");
const thresholdSchema = new mongoose.Schema({
  sensorType: String,
  comparator: String,
  value: Number,
  actions: [String],
  timeStart: String,
  timeEnd: String
});
module.exports = mongoose.model("Threshold", thresholdSchema);

