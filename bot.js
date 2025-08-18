import TelegramBot from "node-telegram-bot-api";
import { token, allowedUsers } from "./config.js";
import { isUserAllowed, isValidYouTubeUrl, isCommand } from "./utils.js";
import { startServer } from "./server.js";
import { VideoDownloader } from "./downloader.js";
import { checkDependencies } from "./health-check.js";

// Создаем бота
const bot = new TelegramBot(token, { polling: true });

// Проверяем зависимости при запуске
checkDependencies();

// Запускаем HTTP сервер
startServer();

// Обработчик сообщений
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text?.trim();

  // Проверка доступа пользователя
  if (!isUserAllowed(userId, allowedUsers)) {
    await bot.sendMessage(chatId, "🚫 У тебя нет доступа к этому боту");
    return;
  }

  // Игнорируем команды
  if (isCommand(text)) return;

  // Проверка валидности YouTube ссылки
  if (!isValidYouTubeUrl(text)) {
    await bot.sendMessage(chatId, "Пришли мне ссылку на YouTube 🎥");
    return;
  }

  // Создаем экземпляр загрузчика и начинаем скачивание
  const downloader = new VideoDownloader(bot, chatId, userId);
  await downloader.download(text);
});

console.log("🤖 Telegram бот запущен и готов к работе!");
