import express from "express";
import { downloadDir, serverPort, publicBaseUrl } from "./config.js";

// HTTP-сервер для раздачи скачанных файлов
const app = express();

// Настройка статических файлов
app.use("/downloads", express.static(downloadDir));

// Запуск сервера
export const startServer = () => {
  app.listen(serverPort, () => {
    console.log(`HTTP сервер запущен на ${publicBaseUrl}`);
    console.log(
      `Раздаю папку ${downloadDir} по адресу ${publicBaseUrl}/downloads/`
    );
  });
};

export { app };
