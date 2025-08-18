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
          url: `${publicBaseUrl}/force-download/${encodeURIComponent(file)}`,
          iosUrl: `${publicBaseUrl}/ios-save/${encodeURIComponent(file)}`,
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
            margin-left: 10px;
          }
          .download-btn:hover { background: #0056b3; }
          .ios-btn { 
            background: #28a745; 
          }
          .ios-btn:hover { 
            background: #218838; 
          }
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
                  <a href="${
                    file.iosUrl
                  }" class="download-btn ios-btn">📱 iOS</a>
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

  // Получаем размер файла
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  // Устанавливаем заголовки для принудительного скачивания
  const mimeType = getMimeType(filename);

  // Безопасное имя файла для заголовков
  const safeFilename = filename.replace(/[^\w\-\.]/g, "_");

  // Более агрессивные заголовки для принудительного скачивания
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeFilename}"`
  );
  res.setHeader("Content-Type", "application/octet-stream"); // Принудительно binary
  res.setHeader("Content-Length", fileSize);

  // Заголовки для предотвращения кэширования
  res.setHeader(
    "Cache-Control",
    "no-cache, no-store, must-revalidate, private"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // Дополнительные заголовки для принудительного скачивания
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  // Читаем и отправляем файл потоком
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// Альтернативный маршрут с параметром force для принудительного скачивания
app.get("/force-download/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(downloadDir, filename);

  // Проверяем, существует ли файл
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send("Файл не найден");
  }

  // Получаем размер файла
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  // Безопасное имя файла для заголовков (убираем недопустимые символы)
  const safeFilename = filename.replace(/[^\w\-\.]/g, "_");

  // Максимально агрессивные заголовки для принудительного скачивания
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeFilename}"`
  );
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", fileSize);
  res.setHeader("Content-Transfer-Encoding", "binary");

  // Заголовки для предотвращения кэширования
  res.setHeader(
    "Cache-Control",
    "no-cache, no-store, must-revalidate, private, max-age=0"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "Thu, 01 Jan 1970 00:00:00 GMT");

  // Дополнительные заголовки
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Download-Options", "noopen");

  // Читаем и отправляем файл потоком
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// Специальный маршрут для iOS - сохранение в фотопленку
app.get("/ios-save/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(downloadDir, filename);

  // Проверяем, существует ли файл
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send("Файл не найден");
  }

  // Получаем размер файла
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  // Определяем правильный MIME-тип для iOS
  const ext = path.extname(filename).toLowerCase();
  let mimeType = "video/mp4"; // по умолчанию

  const iosMimeTypes = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".3gp": "video/3gpp",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".wav": "audio/wav",
  };

  if (iosMimeTypes[ext]) {
    mimeType = iosMimeTypes[ext];
  }

  // Создаем HTML страницу для iOS с принудительным сохранением
  const videoUrl = `${publicBaseUrl}/ios-video/${encodeURIComponent(filename)}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Сохранение в фотопленку</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
          margin: 0; 
          padding: 20px; 
          background: #000; 
          color: white; 
          text-align: center;
        }
        .container { 
          max-width: 500px; 
          margin: 0 auto; 
          padding: 20px;
        }
        .video-container {
          margin: 20px 0;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        video {
          width: 100%;
          height: auto;
          display: block;
        }
        .save-btn {
          background: #007AFF;
          color: white;
          border: none;
          padding: 15px 30px;
          border-radius: 25px;
          font-size: 18px;
          font-weight: 600;
          margin: 20px 10px;
          cursor: pointer;
          transition: background 0.3s;
        }
        .save-btn:hover {
          background: #0056CC;
        }
        .instructions {
          background: rgba(255,255,255,0.1);
          padding: 15px;
          border-radius: 10px;
          margin: 20px 0;
          font-size: 14px;
          line-height: 1.5;
        }
        .download-link {
          display: inline-block;
          background: #34C759;
          color: white;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 20px;
          margin: 10px;
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📱 Сохранение в фотопленку</h1>
        
        <div class="instructions">
          <p><strong>Как сохранить видео:</strong></p>
          <p>1. Нажмите на видео ниже</p>
          <p>2. В открывшемся плеере нажмите кнопку "Поделиться" (квадрат со стрелкой)</p>
          <p>3. Выберите "Сохранить видео"</p>
        </div>

        <div class="video-container">
          <video controls autoplay muted>
            <source src="${videoUrl}" type="${mimeType}">
            Ваш браузер не поддерживает видео.
          </video>
        </div>

        <button class="save-btn" onclick="openVideo()">🎬 Открыть видео</button>
        
        <br>
        <a href="${videoUrl}" class="download-link" download>📥 Скачать напрямую</a>
        
        <div class="instructions">
          <p><small>Если видео не воспроизводится, попробуйте открыть ссылку в Safari</small></p>
        </div>
      </div>

      <script>
        function openVideo() {
          window.open('${videoUrl}', '_blank');
        }
        
        // Автоматически открываем видео в новой вкладке на iOS
        if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
          setTimeout(() => {
            openVideo();
          }, 1000);
        }
      </script>
    </body>
    </html>
  `;

  res.send(html);
});

// Маршрут для прямого воспроизведения видео (для iOS)
app.get("/ios-video/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(downloadDir, filename);

  // Проверяем, существует ли файл
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).send("Файл не найден");
  }

  // Получаем размер файла
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  // Определяем правильный MIME-тип для iOS
  const ext = path.extname(filename).toLowerCase();
  let mimeType = "video/mp4"; // по умолчанию

  const iosMimeTypes = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".3gp": "video/3gpp",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".wav": "audio/wav",
  };

  if (iosMimeTypes[ext]) {
    mimeType = iosMimeTypes[ext];
  }

  // Заголовки для iOS воспроизведения
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", fileSize);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Disposition", "inline");

  // Заголовки для предотвращения кэширования
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // Дополнительные заголовки для iOS
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  // Читаем и отправляем файл потоком
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
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
