# Примеры использования модулей

## Использование конфигурации

```javascript
import { token, allowedUsers, downloadDir } from "./config.js";

console.log(`Токен бота: ${token}`);
console.log(`Разрешенные пользователи: ${allowedUsers}`);
console.log(`Папка загрузок: ${downloadDir}`);
```

## Использование утилит

```javascript
import {
  isUserAllowed,
  isValidYouTubeUrl,
  checkBinary,
  generateUniquePrefix,
} from "./utils.js";

// Проверка доступа пользователя
const userId = 123456789;
const allowedUsers = [123456789, 987654321];
if (isUserAllowed(userId, allowedUsers)) {
  console.log("Пользователь имеет доступ");
}

// Проверка YouTube ссылки
const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
if (isValidYouTubeUrl(url)) {
  console.log("Валидная YouTube ссылка");
}

// Проверка бинарного файла
const ffmpegCheck = checkBinary("ffmpeg", ["-version"]);
if (ffmpegCheck.ok) {
  console.log("ffmpeg найден:", ffmpegCheck.stdout);
}

// Генерация уникального префикса
const prefix = generateUniquePrefix(123, 456);
console.log("Уникальный префикс:", prefix);
```

## Использование загрузчика

```javascript
import { VideoDownloader } from "./downloader.js";

// Создание экземпляра загрузчика
const downloader = new VideoDownloader(bot, chatId, userId);

// Запуск скачивания
await downloader.download("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
```

## Использование сервера

```javascript
import { startServer, app } from "./server.js";

// Запуск сервера
startServer();

// Добавление дополнительных маршрутов
app.get("/status", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});
```

## Проверка зависимостей

```javascript
import { checkDependencies } from "./health-check.js";

// Проверка всех зависимостей
const deps = checkDependencies();
console.log("yt-dlp доступен:", deps.ytDlp);
console.log("ffmpeg доступен:", deps.ffmpeg);
```

## Расширение функциональности

### Добавление нового формата видео

```javascript
// В downloader.js, метод createYtDlpArgs
createYtDlpArgs(url, format = "bv*[height<=720]+ba/best") {
  const outputTemplate = this.generateOutputTemplate();
  return [
    "-f",
    format, // Можно передавать разные форматы
    "-o",
    outputTemplate,
    // ... остальные аргументы
  ];
}
```

### Добавление новых утилит

```javascript
// В utils.js
export const formatFileSize = (bytes) => {
  const sizes = ["Bytes", "KB", "MB", "GB"];
  if (bytes === 0) return "0 Bytes";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
};

export const sanitizeFilename = (filename) => {
  return filename.replace(/[^a-z0-9]/gi, "_").toLowerCase();
};
```

### Добавление логирования

```javascript
// В config.js
export const logLevel = process.env.LOG_LEVEL || "info";

export const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  debug: (msg) => {
    if (logLevel === "debug") console.log(`[DEBUG] ${msg}`);
  },
};
```
