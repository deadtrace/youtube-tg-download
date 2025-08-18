import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { ytDlpPath, extraArgs, downloadDir, publicBaseUrl } from "./config.js";
import { stripAnsi, generateUniquePrefix } from "./utils.js";

// Класс для управления процессом скачивания
export class VideoDownloader {
  constructor(bot, chatId, userId) {
    this.bot = bot;
    this.chatId = chatId;
    this.userId = userId;
    this.progressMsg = null;
    this.finalFilePath = "";
    this.bufferStdout = "";
    this.bufferStderr = "";
    this.lastErrorLines = [];
    this.lastSentPercent = -1;
    this.lastEditAt = 0;
    this.spinnerTick = 0;
    this.spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    this.keepAlive = null;
  }

  // Генерация шаблона имени файла
  generateOutputTemplate() {
    const uniquePrefix = generateUniquePrefix(this.userId, this.chatId);
    return path.join(
      downloadDir,
      `${uniquePrefix} - %(title).100s - %(id)s.%(ext)s`
    );
  }

  // Создание аргументов для yt-dlp
  createYtDlpArgs(url) {
    const outputTemplate = this.generateOutputTemplate();
    return [
      "-f",
      "bv*[height<=720]+ba/best",
      "-o",
      outputTemplate,
      "--progress",
      "--newline",
      "--progress-template",
      "PROGRESS %(progress._percent_str)s %(progress._eta_str)s %(progress.speed)s %(progress.stage)s",
      "--print",
      "after_move:filepath",
      ...extraArgs,
      url,
    ];
  }

  // Обновление прогресса в Telegram
  async maybeEditProgress(percent, extraText) {
    const now = Date.now();
    const rounded = Math.max(0, Math.min(100, Math.floor(percent)));
    if (rounded === this.lastSentPercent && now - this.lastEditAt < 2000)
      return;

    this.lastSentPercent = rounded;
    this.lastEditAt = now;

    const textProgress = `Скачиваю: ${rounded}%${
      extraText ? ` | ${extraText}` : ""
    }`;

    try {
      await this.bot.editMessageText(textProgress, {
        chat_id: this.chatId,
        message_id: this.progressMsg.message_id,
      });
    } catch {}
  }

  // Парсинг строки прогресса yt-dlp
  parseProgressLine(line) {
    // пример: [download]  42.3% of 69.62MiB at 2.32MiB/s ETA 00:30
    const m = line.match(/([0-9]+(?:\.[0-9]+)?)%/);
    if (!m) return false;

    const percentNum = Number(m[1]);
    if (Number.isNaN(percentNum)) return false;

    const speedMatch = line.match(/(\S+\/s)/);
    const etaMatch = line.match(/ETA\s([0-9:]+)/i);
    const extraParts = [];

    if (speedMatch) extraParts.push(speedMatch[1]);
    if (etaMatch) extraParts.push(`ETA ${etaMatch[1]}`);

    const extra = extraParts.join(" · ");
    this.maybeEditProgress(percentNum, extra);
    return true;
  }

  // Парсинг кастомного шаблона прогресса
  parseProgressTemplate(line) {
    // Формат: PROGRESS 42.3% 00:30 2.32MiB/s downloading
    if (!line.startsWith("PROGRESS ")) return false;

    const parts = line.split(/\s+/);
    if (parts.length < 5) return false;

    const percentStr = parts[1] || "0%";
    const etaStr = parts[2] || "?";
    const speedStr = parts[3] || "?";
    const stage = parts[4] || "downloading";

    const p = Number(percentStr.replace("%", ""));
    if (Number.isNaN(p)) return false;

    const stageRu =
      stage === "downloading"
        ? "скачивание"
        : stage.includes("post")
        ? "постобработка"
        : stage.includes("merge")
        ? "слияние"
        : stage;

    const extra = `${stageRu} · ${speedStr} · ETA ${etaStr}`;
    this.maybeEditProgress(p, extra);
    return true;
  }

  // Обработка stdout от yt-dlp
  handleStdout(chunk) {
    this.bufferStdout += String(chunk);
    const lines = this.bufferStdout.split(/\r?\n/);
    this.bufferStdout = lines.pop() || "";

    for (const raw of lines) {
      const line = stripAnsi(raw.trim());
      if (!line) continue;

      if (this.parseProgressTemplate(line)) {
        // ok
      } else if (line.startsWith("[")) {
        this.parseProgressLine(line);
      } else {
        // может быть напечатан финальный путь с --print
        if (!this.finalFilePath && fs.existsSync(line)) {
          this.finalFilePath = line;
        }
      }
    }
  }

  // Обработка stderr от yt-dlp
  handleStderr(chunk) {
    this.bufferStderr += String(chunk);
    const lines = this.bufferStderr.split(/\r?\n/);
    this.bufferStderr = lines.pop() || "";

    for (const raw of lines) {
      const line = stripAnsi(raw.trim());
      if (!line) continue;

      if (!this.parseProgressTemplate(line)) {
        this.parseProgressLine(line);
      }

      this.lastErrorLines.push(line);
      if (this.lastErrorLines.length > 12) {
        this.lastErrorLines.shift();
      }
    }
  }

  // Обработка завершения процесса
  async handleClose(code) {
    clearInterval(this.keepAlive);

    if (code !== 0) {
      const errTail = this.lastErrorLines.join("\n");
      const hint =
        code === 2
          ? "\nПодсказка: проверь ссылку (возможно приватное/недоступное видео), обнови yt-dlp и установи ffmpeg."
          : "";

      await this.bot.editMessageText(
        `Ошибка при скачивании (код ${code}).${hint}\n${
          errTail ? `\n\nЛог: ${errTail}` : ""
        }`,
        {
          chat_id: this.chatId,
          message_id: this.progressMsg.message_id,
        }
      );
      return;
    }

    try {
      // если путь не был получен из stdout, ищем последний файл
      if (!this.finalFilePath || !fs.existsSync(this.finalFilePath)) {
        const files = fs
          .readdirSync(downloadDir)
          .filter((f) => !f.endsWith(".part"))
          .map((f) => ({
            name: f,
            time: fs.statSync(path.join(downloadDir, f)).mtime,
          }))
          .sort((a, b) => b.time - a.time);

        this.finalFilePath = files[0]
          ? path.join(downloadDir, files[0].name)
          : "";
      }

      if (!this.finalFilePath) {
        await this.bot.editMessageText("Не удалось найти сохранённый файл.", {
          chat_id: this.chatId,
          message_id: this.progressMsg.message_id,
        });
        return;
      }

      const fileName = path.basename(this.finalFilePath);
      const publicUrl = `${publicBaseUrl}/downloads/${encodeURIComponent(
        fileName
      )}`;

      await this.bot.editMessageText(`Готово! Ссылка на видео: ${publicUrl}`, {
        chat_id: this.chatId,
        message_id: this.progressMsg.message_id,
        disable_web_page_preview: true,
      });
    } catch (e) {
      await this.bot.editMessageText(`Ошибка при отправке: ${e.message}`, {
        chat_id: this.chatId,
        message_id: this.progressMsg.message_id,
      });
    }
  }

  // Обработка ошибки процесса
  async handleError(err) {
    await this.bot.editMessageText(
      `Ошибка при запуске загрузки: ${err.message}`,
      {
        chat_id: this.chatId,
        message_id: this.progressMsg.message_id,
      }
    );
  }

  // Запуск процесса скачивания
  async download(url) {
    // Отправляем начальное сообщение о прогрессе
    this.progressMsg = await this.bot.sendMessage(
      this.chatId,
      "Скачиваю видео до 720p... ⏳"
    );

    // Запускаем keep-alive для спиннера
    this.keepAlive = setInterval(async () => {
      if (this.lastSentPercent < 0 && Date.now() - this.lastEditAt > 4000) {
        this.spinnerTick = (this.spinnerTick + 1) % this.spinnerFrames.length;
        try {
          await this.bot.editMessageText(
            `Скачиваю... ${
              this.spinnerFrames[this.spinnerTick]
            } (подготовка/ожидание прогресса)`,
            { chat_id: this.chatId, message_id: this.progressMsg.message_id }
          );
          this.lastEditAt = Date.now();
        } catch {}
      }
    }, 4000);

    // Запускаем yt-dlp
    const args = this.createYtDlpArgs(url);
    const child = spawn(ytDlpPath, args, {
      shell: false,
      env: { ...process.env, PYTHONUNBUFFERED: "1", FORCE_COLOR: "0" },
    });

    // Настраиваем обработчики событий
    child.stdout.on("data", (chunk) => this.handleStdout(chunk));
    child.stderr.on("data", (chunk) => this.handleStderr(chunk));
    child.on("error", (err) => this.handleError(err));
    child.on("close", (code) => this.handleClose(code));
  }
}
