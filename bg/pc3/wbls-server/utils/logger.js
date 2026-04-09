const fs = require("fs");
const path = require("path");

const LOG_FILE = path.resolve(__dirname, "../logs.txt");
const logStream = fs.createWriteStream(LOG_FILE, { flags: "w" });
logStream.on("error", (err) => {
  console.error("[wbls-server] log stream error", err);
});

const log = (message, meta) => {
  const now = new Date();
  const kstOffset = 9 * 60;
  const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
  const stamp = kstTime.toISOString().replace("Z", "+09:00");
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  const line = `[wbls-server] ${stamp} ${message}${suffix}`;
  console.log(line);
  if (logStream.writable) {
    logStream.write(`${line}\n`, (err) => {
      if (err) {
        console.error("[wbls-server] failed to write log line", err);
      }
    });
  }
};

module.exports = { log };
