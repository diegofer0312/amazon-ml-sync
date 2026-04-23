const winston = require("winston");
const fs = require("fs");
if (!fs.existsSync("./logs")) fs.mkdirSync("./logs", { recursive: true });
if (!fs.existsSync("./data")) fs.mkdirSync("./data", { recursive: true });
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: "./logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "./logs/combined.log" }),
    new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), winston.format.simple()) })
  ]
});
module.exports = logger;
