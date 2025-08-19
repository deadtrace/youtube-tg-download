import fs from "fs";
import path from "path";

const MODES_FILE = "./user-modes.json";

// Загрузка режимов пользователей из файла
export function loadUserModes() {
  try {
    if (fs.existsSync(MODES_FILE)) {
      const data = fs.readFileSync(MODES_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Ошибка при загрузке режимов пользователей:", error.message);
  }
  return {};
}

// Сохранение режимов пользователей в файл
export function saveUserModes(userModes) {
  try {
    fs.writeFileSync(MODES_FILE, JSON.stringify(userModes, null, 2));
  } catch (error) {
    console.error(
      "Ошибка при сохранении режимов пользователей:",
      error.message
    );
  }
}

// Установка режима для пользователя
export function setUserMode(userModes, userId, mode) {
  userModes[userId] = mode;
  saveUserModes(userModes);
}

// Получение режима пользователя
export function getUserMode(userModes, userId) {
  return userModes[userId] || "video"; // по умолчанию видео
}
