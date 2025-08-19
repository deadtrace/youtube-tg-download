import TelegramBot from "node-telegram-bot-api";
import { token, allowedUsers } from "./config.js";
import { isUserAllowed, isValidYouTubeUrl, isCommand } from "./utils.js";
import { startServer } from "./server.js";
import { VideoDownloader } from "./downloader.js";
import { AudioDownloader } from "./audio-downloader.js";
import { checkDependencies } from "./health-check.js";
import { cleanupScheduler } from "./scheduler.js";
import { loadUserModes, setUserMode, getUserMode } from "./user-modes.js";

// Создаем бота
const bot = new TelegramBot(token, { polling: true });

// Загружаем сохраненные режимы пользователей
const userDownloadMode = loadUserModes();

// Проверяем зависимости при запуске
checkDependencies();

// Запускаем HTTP сервер
startServer();

// Запускаем планировщик очистки файлов
cleanupScheduler.start();

// Обработка команд
async function handleCommands(command, chatId, userId) {
  switch (command) {
    case "/audio":
      setUserMode(userDownloadMode, userId, "audio");
      await bot.sendMessage(
        chatId,
        "🎵 Режим скачивания аудио включен!\n\n📥 Отправь ссылку на YouTube для скачивания только аудио.\n\n💡 Используй /mode для проверки текущего режима."
      );
      break;

    case "/video":
      setUserMode(userDownloadMode, userId, "video");
      await bot.sendMessage(
        chatId,
        "🎥 Режим скачивания видео включен!\n\n📥 Отправь ссылку на YouTube для скачивания видео.\n\n💡 Используй /mode для проверки текущего режима."
      );
      break;

    case "/cleanup":
      await bot.sendMessage(
        chatId,
        "🧹 Запускаю ручную очистку старых файлов..."
      );
      await cleanupScheduler.cleanupOldFiles();
      await bot.sendMessage(chatId, "✅ Ручная очистка завершена!");
      break;

    case "/stats":
      const stats = cleanupScheduler.getFileStats();
      const totalSizeMB = (stats.totalSize / (1024 * 1024)).toFixed(1);
      const message =
        `📊 Статистика файлов:\n\n` +
        `📁 Всего файлов: ${stats.count}\n` +
        `💾 Общий размер: ${totalSizeMB} МБ\n` +
        `🗑️ Старых файлов (>${process.env.FILE_MAX_AGE_DAYS || 7}д): ${
          stats.oldFiles
        }`;
      await bot.sendMessage(chatId, message);
      break;

    case "/mode":
      const currentMode = getUserMode(userDownloadMode, userId);
      const modeEmoji = currentMode === "audio" ? "🎵" : "🎥";
      const modeText = currentMode === "audio" ? "аудио" : "видео";
      const modeMessage =
        `${modeEmoji} Текущий режим: **${modeText}**\n\n` +
        `📥 Отправь ссылку на YouTube для скачивания в режиме ${modeText}`;
      await bot.sendMessage(chatId, modeMessage, { parse_mode: "Markdown" });
      break;

    case "/help":
      const helpText =
        `🤖 Доступные команды:\n\n` +
        `📥 Отправь ссылку на YouTube для скачивания\n` +
        `/audio - Включить режим скачивания аудио\n` +
        `/video - Включить режим скачивания видео (по умолчанию)\n` +
        `/mode - Показать текущий режим скачивания\n` +
        `/cleanup - Ручная очистка старых файлов\n` +
        `/stats - Статистика файлов\n` +
        `/help - Показать это сообщение`;
      await bot.sendMessage(chatId, helpText);
      break;

    default:
      // Игнорируем неизвестные команды
      break;
  }
}

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

  // Обработка команд
  if (isCommand(text)) {
    await handleCommands(text, chatId, userId);
    return;
  }

  // Проверка валидности YouTube ссылки
  if (!isValidYouTubeUrl(text)) {
    await bot.sendMessage(chatId, "Пришли мне ссылку на YouTube 🎥");
    return;
  }

  // Определяем режим скачивания
  const downloadMode = getUserMode(userDownloadMode, userId);

  // Создаем экземпляр загрузчика и начинаем скачивание
  if (downloadMode === "audio") {
    const downloader = new AudioDownloader(bot, chatId, userId);
    await downloader.download(text);
  } else {
    const downloader = new VideoDownloader(bot, chatId, userId);
    await downloader.download(text);
  }
});

console.log("🤖 Telegram бот запущен и готов к работе!");

// Обработка сигналов завершения
process.on("SIGINT", () => {
  console.log("\n🛑 Получен сигнал SIGINT, останавливаю бота...");
  cleanupScheduler.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Получен сигнал SIGTERM, останавливаю бота...");
  cleanupScheduler.stop();
  process.exit(0);
});
