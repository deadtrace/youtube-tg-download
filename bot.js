import TelegramBot from "node-telegram-bot-api";
import { spawn } from "child_process";
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

  const progressMsg = await bot.sendMessage(
    chatId,
    "Скачиваю видео до 1080p... ⏳"
  );

  const outputTemplate = path.join(
    downloadDir,
    "%(title).100s - %(id)s.%(ext)s"
  );

  const args = [
    "-f",
    "bv*[height<=1080]+ba/best",
    "-o",
    outputTemplate,
    "--newline",
    "--print",
    "after_move:filepath",
    text,
  ];

  const child = spawn("yt-dlp", args, { shell: true });

  let finalFilePath = "";
  let bufferStdout = "";
  let bufferStderr = "";
  let lastSentPercent = -1;
  let lastEditAt = 0;

  const maybeEditProgress = async (percent, extraText) => {
    const now = Date.now();
    const rounded = Math.max(0, Math.min(100, Math.floor(percent)));
    if (rounded === lastSentPercent && now - lastEditAt < 1500) return;
    lastSentPercent = rounded;
    lastEditAt = now;
    const textProgress = `Скачиваю: ${rounded}%${
      extraText ? ` | ${extraText}` : ""
    }`;
    try {
      await bot.editMessageText(textProgress, {
        chat_id: chatId,
        message_id: progressMsg.message_id,
      });
    } catch {}
  };

  const parseProgressLine = (line) => {
    // пример: [download]  42.3% of 69.62MiB at 2.32MiB/s ETA 00:30
    const m = line.match(/\[download\]\s+([0-9]+(?:\.[0-9]+)?)%/);
    if (m) {
      const speedMatch = line.match(/\s(\S+\/s)\sETA\s([0-9:]+)/);
      const extra = speedMatch ? `${speedMatch[1]} · ETA ${speedMatch[2]}` : "";
      const percentNum = Number(m[1]);
      if (!Number.isNaN(percentNum)) maybeEditProgress(percentNum, extra);
    }
  };

  child.stdout.on("data", async (chunk) => {
    bufferStdout += String(chunk);
    const lines = bufferStdout.split(/\r?\n/);
    bufferStdout = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("[")) {
        parseProgressLine(line);
      } else {
        // может быть напечатан финальный путь с --print
        if (!finalFilePath && fs.existsSync(line)) finalFilePath = line;
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    bufferStderr += String(chunk);
    const lines = bufferStderr.split(/\r?\n/);
    bufferStderr = lines.pop() || "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      parseProgressLine(line);
    }
  });

  child.on("error", async (err) => {
    await bot.editMessageText(`Ошибка при запуске загрузки: ${err.message}`, {
      chat_id: chatId,
      message_id: progressMsg.message_id,
    });
  });

  child.on("close", async (code) => {
    if (code !== 0) {
      await bot.editMessageText(`Ошибка при скачивании (код ${code}).`, {
        chat_id: chatId,
        message_id: progressMsg.message_id,
      });
      return;
    }

    try {
      // если путь не был получен из stdout, ищем последний файл
      if (!finalFilePath || !fs.existsSync(finalFilePath)) {
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
        await bot.editMessageText("Не удалось найти сохранённый файл.", {
          chat_id: chatId,
          message_id: progressMsg.message_id,
        });
        return;
      }

      const fileName = path.basename(finalFilePath);
      const publicUrl = `${publicBaseUrl}/downloads/${encodeURIComponent(
        fileName
      )}`;

      await bot.editMessageText(`Готово! Ссылка на видео: ${publicUrl}`, {
        chat_id: chatId,
        message_id: progressMsg.message_id,
        disable_web_page_preview: true,
      });
    } catch (e) {
      await bot.editMessageText(`Ошибка при отправке: ${e.message}`, {
        chat_id: chatId,
        message_id: progressMsg.message_id,
      });
    }
  });
});
