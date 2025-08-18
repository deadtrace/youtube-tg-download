import TelegramBot from "node-telegram-bot-api";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

// === НАСТРОЙКИ ===
const token = "ТОКЕН_ТВОЕГО_БОТА";
const downloadDir = "./downloads";
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir);

// белый список пользователей (только они могут скачивать видео)
const allowedUsers = [];

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

  const outputTemplate = path.join(downloadDir, "%(title).100s.%(ext)s");
  const cmd = `yt-dlp -f "bv*[height<=1080]+ba/best" -o "${outputTemplate}" "${text}"`;

  exec(cmd, async (error) => {
    if (error) {
      bot.sendMessage(chatId, `Ошибка при скачивании: ${error.message}`);
      return;
    }

    try {
      // находим последний скачанный файл
      const files = fs
        .readdirSync(downloadDir)
        .map((f) => ({
          name: f,
          time: fs.statSync(path.join(downloadDir, f)).mtime,
        }))
        .sort((a, b) => b.time - a.time);

      const filePath = path.join(downloadDir, files[0].name);

      // отправляем в Telegram как видео
      await bot.sendVideo(chatId, filePath);

      // удаляем после отправки
      fs.unlinkSync(filePath);
    } catch (e) {
      bot.sendMessage(chatId, `Ошибка при отправке: ${e.message}`);
    }
  });
});
