import fs from "fs";
import "dotenv/config";

// === НАСТРОЙКИ ===
const token = process.env.BOT_TOKEN;
const downloadDir = "./downloads";
const ytDlpPath = process.env.YTDLP_PATH || "yt-dlp";
const extraArgsRaw = (process.env.YTDLP_EXTRA_ARGS || "").trim();
const serverPort = Number(process.env.SERVER_PORT || 3000);
const publicBaseUrl = (
  process.env.PUBLIC_BASE_URL || `http://localhost:${serverPort}`
).replace(/\/$/, "");

// Максимальный размер файла для отправки в Telegram (в МБ)
const maxTelegramFileSizeMB = 50;

// Настройки планировщика очистки
const cleanupIntervalHours = Number(process.env.CLEANUP_INTERVAL_HOURS || 24);
const fileMaxAgeDays = Number(process.env.FILE_MAX_AGE_DAYS || 7);

// Создаем папку для загрузок если её нет
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir);
}

// Парсинг дополнительных аргументов yt-dlp
const parseExtraArgs = (raw) =>
  raw
    ? raw
        .match(/(?:[^\s"]+|"[^"]*")+?/g)
        .filter(Boolean)
        .map((s) => s.replace(/^"|"$/g, ""))
    : [];

const extraArgs = parseExtraArgs(extraArgsRaw);

// Белый список пользователей
const allowedUsersEnv = process.env.ALLOWED_USERS || "";
const allowedUsers = allowedUsersEnv
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => Number(s))
  .filter((n) => !Number.isNaN(n));

// Проверка обязательных настроек
if (!token) {
  console.error("Не задан BOT_TOKEN в переменных окружения.");
  process.exit(1);
}

export {
  token,
  downloadDir,
  ytDlpPath,
  extraArgs,
  allowedUsers,
  serverPort,
  publicBaseUrl,
  maxTelegramFileSizeMB,
  cleanupIntervalHours,
  fileMaxAgeDays,
};
