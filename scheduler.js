import fs from "fs";
import path from "path";
import { downloadDir, cleanupIntervalHours, fileMaxAgeDays } from "./config.js";

class FileCleanupScheduler {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  // Запуск планировщика
  start() {
    if (this.intervalId) {
      console.log("🔄 Планировщик уже запущен");
      return;
    }

    console.log(`🧹 Планировщик очистки запущен (интервал: ${cleanupIntervalHours}ч, возраст файлов: ${fileMaxAgeDays}д)`);
    
    // Запускаем первую очистку через 1 минуту после старта
    setTimeout(() => this.cleanupOldFiles(), 60000);
    
    // Устанавливаем периодическую очистку
    this.intervalId = setInterval(() => {
      this.cleanupOldFiles();
    }, cleanupIntervalHours * 60 * 60 * 1000);
  }

  // Остановка планировщика
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("🛑 Планировщик очистки остановлен");
    }
  }

  // Очистка старых файлов
  async cleanupOldFiles() {
    if (this.isRunning) {
      console.log("⏳ Очистка уже выполняется, пропускаем...");
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      console.log("🧹 Начинаю очистку старых файлов...");
      
      if (!fs.existsSync(downloadDir)) {
        console.log("📁 Папка загрузок не существует, пропускаем очистку");
        return;
      }

      const files = fs.readdirSync(downloadDir);
      const now = Date.now();
      const maxAgeMs = fileMaxAgeDays * 24 * 60 * 60 * 1000; // Максимальный возраст в миллисекундах
      
      let deletedCount = 0;
      let totalSize = 0;

      for (const fileName of files) {
        const filePath = path.join(downloadDir, fileName);
        
        try {
          const stats = fs.statSync(filePath);
          
          // Пропускаем папки и временные файлы
          if (stats.isDirectory() || fileName.endsWith('.part')) {
            continue;
          }

          const fileAge = now - stats.mtime.getTime();
          
          if (fileAge > maxAgeMs) {
            const fileSize = stats.size;
            fs.unlinkSync(filePath);
            
            deletedCount++;
            totalSize += fileSize;
            
            console.log(`🗑️ Удален файл: ${fileName} (${this.formatFileSize(fileSize)}, возраст: ${this.formatAge(fileAge)})`);
          }
        } catch (error) {
          console.error(`❌ Ошибка при обработке файла ${fileName}:`, error.message);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Очистка завершена за ${duration}мс: удалено ${deletedCount} файлов, освобождено ${this.formatFileSize(totalSize)}`);
      
    } catch (error) {
      console.error("❌ Ошибка при очистке файлов:", error.message);
    } finally {
      this.isRunning = false;
    }
  }

  // Форматирование размера файла
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Форматирование возраста файла
  formatAge(ageMs) {
    const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ageMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    
    if (days > 0) {
      return `${days}д ${hours}ч`;
    } else {
      return `${hours}ч`;
    }
  }

  // Получение статистики файлов
  getFileStats() {
    try {
      if (!fs.existsSync(downloadDir)) {
        return { count: 0, totalSize: 0, oldFiles: 0 };
      }

      const files = fs.readdirSync(downloadDir);
      const now = Date.now();
      const maxAgeMs = fileMaxAgeDays * 24 * 60 * 60 * 1000;
      
      let totalSize = 0;
      let oldFiles = 0;

      for (const fileName of files) {
        const filePath = path.join(downloadDir, fileName);
        
        try {
          const stats = fs.statSync(filePath);
          
          if (!stats.isDirectory() && !fileName.endsWith('.part')) {
            totalSize += stats.size;
            
            const fileAge = now - stats.mtime.getTime();
            if (fileAge > maxAgeMs) {
              oldFiles++;
            }
          }
        } catch (error) {
          // Игнорируем ошибки при чтении файлов
        }
      }

      return {
        count: files.length,
        totalSize,
        oldFiles
      };
    } catch (error) {
      console.error("Ошибка при получении статистики файлов:", error.message);
      return { count: 0, totalSize: 0, oldFiles: 0 };
    }
  }
}

// Создаем и экспортируем единственный экземпляр планировщика
export const cleanupScheduler = new FileCleanupScheduler();
