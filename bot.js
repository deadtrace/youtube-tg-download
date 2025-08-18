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
const ytDlpPath = process.env.YTDLP_PATH || "yt-dlp";
const extraArgsRaw = (process.env.YTDLP_EXTRA_ARGS || "").trim();
const parseExtraArgs = (raw) =>
  raw
    ? raw
        .match(/(?:[^\s"]+|"[^"]*")+?/g)
        .filter(Boolean)
        .map((s) => s.replace(/^"|"$/g, ""))
    : [];
const extraArgs = parseExtraArgs(extraArgsRaw);

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

// Проверка наличия yt-dlp и ffmpeg
import { spawnSync } from "child_process";
const checkBinary = (bin, args) => {
  try {
    const res = spawnSync(bin, args, { encoding: "utf8" });
    if (res.error) return { ok: false, error: res.error.message };
    if (res.status !== 0 && res.status !== null)
      return { ok: false, error: res.stderr || res.stdout };
    return { ok: true, stdout: res.stdout.trim() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

const ytCheck = checkBinary(ytDlpPath, ["--version"]);
if (!ytCheck.ok) {
  console.warn(
    `yt-dlp не найден или не запускается по пути '${ytDlpPath}'. Ошибка: ${ytCheck.error}`
  );
}
const ffmpegCheck = checkBinary("ffmpeg", ["-version"]);
if (!ffmpegCheck.ok) {
  console.warn(
    `ffmpeg не найден или не запускается. Слияние видео/аудио может падать. Ошибка: ${ffmpegCheck.error}`
  );
}

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
    "--progress",
    "--newline",
    "--progress-template",
    "PROGRESS %(progress._percent_str)s %(progress._eta_str)s %(progress.speed)s %(progress.stage)s",
    "--print",
    "after_move:filepath",
    ...extraArgs,
    text,
  ];

  const child = spawn(ytDlpPath, args, {
    shell: false,
    env: { ...process.env, PYTHONUNBUFFERED: "1", FORCE_COLOR: "0" },
  });

  let finalFilePath = "";
  let bufferStdout = "";
  let bufferStderr = "";
  const lastErrorLines = [];
  let lastSentPercent = -1;
  let lastEditAt = 0;
  let spinnerTick = 0;
  const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]; // fallback-индикатор
  const keepAlive = setInterval(async () => {
    // Если давно не обновляли и процента ещё нет — покрутим спиннер
    if (lastSentPercent < 0 && Date.now() - lastEditAt > 4000) {
      spinnerTick = (spinnerTick + 1) % spinnerFrames.length;
      try {
        await bot.editMessageText(
          `Скачиваю... ${spinnerFrames[spinnerTick]} (подготовка/ожидание прогресса)`,
          { chat_id: chatId, message_id: progressMsg.message_id }
        );
        lastEditAt = Date.now();
      } catch {}
    }
  }, 4000);
  const stripAnsi = (s) => s.replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, "");

  const maybeEditProgress = async (percent, extraText) => {
    const now = Date.now();
    const rounded = Math.max(0, Math.min(100, Math.floor(percent)));
    if (rounded === lastSentPercent && now - lastEditAt < 2000) return;
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
    maybeEditProgress(percentNum, extra);
    return true;
  };

  const parseProgressTemplate = (line) => {
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
    maybeEditProgress(p, extra);
    return true;
  };

  child.stdout.on("data", async (chunk) => {
    bufferStdout += String(chunk);
    const lines = bufferStdout.split(/\r?\n/);
    bufferStdout = lines.pop() || "";
    for (const raw of lines) {
      const line = stripAnsi(raw.trim());
      if (!line) continue;
      if (parseProgressTemplate(line)) {
        // ok
      } else if (line.startsWith("[")) {
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
      const line = stripAnsi(raw.trim());
      if (!line) continue;
      if (!parseProgressTemplate(line)) parseProgressLine(line);
      lastErrorLines.push(line);
      if (lastErrorLines.length > 12) lastErrorLines.shift();
    }
  });

  child.on("error", async (err) => {
    await bot.editMessageText(`Ошибка при запуске загрузки: ${err.message}`, {
      chat_id: chatId,
      message_id: progressMsg.message_id,
    });
  });

  child.on("close", async (code) => {
    clearInterval(keepAlive);
    if (code !== 0) {
      const errTail = lastErrorLines.join("\n");
      const hint =
        code === 2
          ? "\nПодсказка: проверь ссылку (возможно приватное/недоступное видео), обнови yt-dlp и установи ffmpeg."
          : "";
      await bot.editMessageText(
        `Ошибка при скачивании (код ${code}).${hint}\n${
          errTail ? `\n\nЛог: ${errTail}` : ""
        }`,
        {
          chat_id: chatId,
          message_id: progressMsg.message_id,
        }
      );
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
