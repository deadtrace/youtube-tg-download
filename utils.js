import { spawnSync } from "child_process";

// Проверка наличия бинарных файлов
export const checkBinary = (bin, args) => {
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

// Удаление ANSI escape кодов из строки
export const stripAnsi = (s) => s.replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, "");

// Генерация уникального префикса для файлов
export const generateUniquePrefix = (userId, chatId) => {
  return [
    `u${userId}`,
    `c${chatId}`,
    Date.now(),
    Math.random().toString(36).slice(2, 8),
  ].join("-");
};

// Проверка доступности пользователя
export const isUserAllowed = (userId, allowedUsers) => {
  return allowedUsers.includes(userId);
};

// Проверка валидности YouTube ссылки
export const isValidYouTubeUrl = (text) => {
  return text && (text.includes("youtube.com") || text.includes("youtu.be"));
};

// Проверка является ли сообщение командой
export const isCommand = (text) => {
  return text && text.startsWith("/");
};
