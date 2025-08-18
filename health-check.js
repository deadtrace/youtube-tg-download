import { checkBinary } from "./utils.js";
import { ytDlpPath } from "./config.js";

// Проверка наличия необходимых бинарных файлов
export const checkDependencies = () => {
  console.log("🔍 Проверяю зависимости...");

  const ytCheck = checkBinary(ytDlpPath, ["--version"]);
  if (!ytCheck.ok) {
    console.warn(
      `⚠️  yt-dlp не найден или не запускается по пути '${ytDlpPath}'. Ошибка: ${ytCheck.error}`
    );
  } else {
    console.log(`✅ yt-dlp найден: ${ytCheck.stdout}`);
  }

  const ffmpegCheck = checkBinary("ffmpeg", ["-version"]);
  if (!ffmpegCheck.ok) {
    console.warn(
      `⚠️  ffmpeg не найден или не запускается. Слияние видео/аудио может падать. Ошибка: ${ffmpegCheck.error}`
    );
  } else {
    console.log(`✅ ffmpeg найден`);
  }

  return {
    ytDlp: ytCheck.ok,
    ffmpeg: ffmpegCheck.ok,
  };
};
