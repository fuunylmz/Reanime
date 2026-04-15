import { prisma } from "./db";

export async function getSetting(key: string, defaultValue: string = "") {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s ? s.value : defaultValue;
}

export async function setSetting(key: string, value: string) {
  return await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getAllSettings() {
  const records = await prisma.setting.findMany();
  const config = {
    openaiKey: "",
    openaiBaseURL: "",
    openaiModel: "gpt-4o-mini",
    tmdbKey: "",
    sourceDir: "",
    targetDir: "",
    targetDirAnime: "",
    targetDirTV: "",
    targetDirMovie: "",
  };
  records.forEach((r: any) => {
    if (r.key in config) {
      (config as any)[r.key] = r.value;
    }
  });
  return config;
}
