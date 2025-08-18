import express from "express";
import { downloadDir, serverPort, publicBaseUrl } from "./config.js";
import path from "path";
import fs from "fs";

// HTTP-сервер для раздачи скачанных файлов
const app = express();

// Функция для определения MIME-типа по расширению файла
const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".flv": "video/x-flv",
    ".m4v": "video/x-m4v",
    ".3gp": "video/3gpp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
  };
  return mimeTypes[ext] || "application/octet-stream";
};

// Функция для форматирования размера файла
const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Маршрут для просмотра списка файлов
app.get("/downloads", (req, res) => {
  try {
    const files = fs
      .readdirSync(downloadDir)
      .filter((file) => !file.endsWith(".part")) // Исключаем временные файлы
      .map((file) => {
        const filePath = path.join(downloadDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          size: formatFileSize(stats.size),
          sizeBytes: stats.size,
          modified: stats.mtime.toISOString(),
          url: `${publicBaseUrl}/downloads/${encodeURIComponent(file)}`,
        };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified)); // Сортировка по дате изменения

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Скачанные файлы</title>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          h1 { color: #333; text-align: center; margin-bottom: 30px; }
          .file-list { list-style: none; padding: 0; }
          .file-item { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            padding: 15px; 
            margin: 10px 0; 
            background: #f8f9fa; 
            border-radius: 5px; 
            border-left: 4px solid #007bff;
          }
          .file-info { flex: 1; }
          .file-name { font-weight: bold; color: #333; margin-bottom: 5px; }
          .file-meta { font-size: 12px; color: #666; }
          .download-btn { 
            background: #007bff; 
            color: white; 
            padding: 8px 16px; 
            text-decoration: none; 
            border-radius: 4px; 
            font-size: 14px;
            transition: background 0.3s;
          }
          .download-btn:hover { background: #0056b3; }
          .empty { text-align: center; color: #666; font-style: italic; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📁 Скачанные файлы</h1>
          ${
            files.length > 0
              ? `
            <ul class="file-list">
              ${files
                .map(
                  (file) => `
                <li class="file-item">
                  <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-meta">
                      Размер: ${file.size} | 
                      Изменен: ${new Date(file.modified).toLocaleString(
                        "ru-RU"
                      )}
                    </div>
                  </div>
                  <a href="${file.url}" class="download-btn">📥 Скачать</a>
                </li>
              `
                )
                .join("")}
            </ul>
          `
              : `
            <div class="empty">
              <p>Пока нет скачанных файлов</p>
              <p>Отправьте ссылку на YouTube в Telegram бота</p>
            </div>
          `
          }
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    res.status(500).send(`Ошибка при чтении файлов: ${error.message}`);
  }
});

// Маршрут для автоматического скачивания файлов
app.get("/downloads/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(downloadDir, filename);

  // Проверяем, существует ли файл
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send("Файл не найден");
  }

  // Устанавливаем заголовки для принудительного скачивания
  const mimeType = getMimeType(filename);

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", mimeType);

  // Добавляем заголовки для кэширования
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // Отправляем файл
  res.sendFile(filePath);
});

// Запуск сервера
export const startServer = () => {
  app.listen(serverPort, () => {
    console.log(`HTTP сервер запущен на ${publicBaseUrl}`);
    console.log(
      `Раздаю папку ${downloadDir} по адресу ${publicBaseUrl}/downloads/`
    );
    console.log("📥 Файлы будут автоматически скачиваться при открытии ссылок");
    console.log(
      "📋 Список файлов доступен по адресу: ${publicBaseUrl}/downloads"
    );
  });
};

export { app };
