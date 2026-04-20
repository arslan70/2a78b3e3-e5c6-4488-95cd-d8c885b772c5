import { cp, mkdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

export async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true, errorOnExist: false, force: true });
}

export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function isDir(path: string): Promise<boolean> {
  if (!existsSync(path)) return false;
  const s = await stat(path);
  return s.isDirectory();
}
