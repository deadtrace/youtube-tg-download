import TelegramBot from "node-telegram-bot-api";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import express from "express";
import "dotenv/config";

// === НАСТРОЙКИ ===
const token = process.env.BOT_TOKEN;
const downloadDir = "./downloads";
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

if (!token) {
  console.error("Не задан BOT_TOKEN в переменных окружения.");
  process.exit(1);
}

// белый список пользователей (только они могут скачивать видео)
const allowedUsersEnv = process.env.ALLOWED_USERS || "";
const allowedUsers = allowedUsersEnv
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => Number(s))
  .filter((n) => !Number.isNaN(n));

// HTTP-сервер для раздачи скачанных файлов
const app = express();
const serverPort = Number(process.env.SERVER_PORT || 3000);
const publicBaseUrl = (
  process.env.PUBLIC_BASE_URL || `http://localhost:${serverPort}`
).replace(/\/$/, "");

app.use("/downloads", express.static(downloadDir));

app.listen(serverPort, () => {
  console.log(`HTTP сервер запущен на ${publicBaseUrl}`);
  console.log(
    `Раздаю папку ${downloadDir} по адресу ${publicBaseUrl}/downloads/`
  );
});

// создаем бота
const bot = new TelegramBot(token, { polling: true });

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text?.trim();

  // проверка доступа
  if (!allowedUsers.includes(userId)) {
    bot.sendMessage(chatId, "🚫 У тебя нет доступа к этому боту");
    return;
  }

  // игнорируем команды
  if (text.startsWith("/")) return;

  if (!text || (!text.includes("youtube.com") && !text.includes("youtu.be"))) {
    bot.sendMessage(chatId, "Пришли мне ссылку на YouTube 🎥");
    return;
  }

  bot.sendMessage(chatId, "Скачиваю видео до 1080p... ⏳");

  const outputTemplate = path.join(
    downloadDir,
    "%(title).100s - %(id)s.%(ext)s"
  );
  const cmd = `yt-dlp -f "bv*[height<=1080]+ba/best" -o "${outputTemplate}" --print after_move:filepath "${text}"`;

  exec(cmd, async (error, stdout) => {
    if (error) {
      bot.sendMessage(chatId, `Ошибка при скачивании: ${error.message}`);
      return;
    }

    try {
      // пробуем получить путь из stdout yt-dlp
      const stdoutLines = String(stdout || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      let finalFilePath = stdoutLines[stdoutLines.length - 1];

      if (!finalFilePath || !fs.existsSync(finalFilePath)) {
        // fallback: находим последний скачанный файл (исключаем .part)
        const files = fs
          .readdirSync(downloadDir)
          .filter((f) => !f.endsWith(".part"))
          .map((f) => ({
            name: f,
            time: fs.statSync(path.join(downloadDir, f)).mtime,
          }))
          .sort((a, b) => b.time - a.time);
        finalFilePath = files[0] ? path.join(downloadDir, files[0].name) : "";
      }

      if (!finalFilePath) {
        await bot.sendMessage(chatId, "Не удалось найти сохранённый файл.");
        return;
      }

      const fileName = path.basename(finalFilePath);
      const publicUrl = `${publicBaseUrl}/downloads/${encodeURIComponent(
        fileName
      )}`;
      await bot.sendMessage(chatId, `Готово! Ссылка на видео: ${publicUrl}`);
    } catch (e) {
      bot.sendMessage(chatId, `Ошибка при отправке: ${e.message}`);
    }
  });
});
