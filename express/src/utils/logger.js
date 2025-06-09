const winston = require('winston');
const winstonDaily = require('winston-daily-rotate-file');
const process = require('process');

const { combine, timestamp, label, printf } = winston.format;

const logDirectory = `${process.cwd()}/logs/`;
const logFormat =printf(({level, message, label, timestamp}) => {
  return `${timestamp} [${label} ${level}: ${message}]`
})

const logger = winston.createLogger({
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    label({ label: 'chat-app winston logger' }),
    logFormat,
  ),

  transports: [
    new winstonDaily({
      level: 'info',
      datePattern: 'YYYY-MM-DD',
      dirname: logDirectory,
      filename: `%DATE%.log`,
      maxFiles: 30,
      zippedArchive: true,
    }),

    new winstonDaily({
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      dirname: logDirectory,
      filename: `%DATE%.exception.log`,
      maxFiles: 30,
      zippedArchive: true,
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(), // 색깔 넣어서 출력
        winston.format.simple(), // `${info.level}: ${info.message} JSON.stringify({ ...rest })` 포맷으로 출력
      ),
    }),
  );
}

module.exports = logger;