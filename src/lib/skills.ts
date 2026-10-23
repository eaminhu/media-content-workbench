import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
const paths = ["SKILL.md", "references/rubric.md", "scripts/read_context.py"] as const;
export const skillName = "topic-assessment";
export const hashBytes = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
export async function loadSkill() {
  const files = await Promise.all(paths.map(async path => ({
    path, bytes: await readFile(join(process.cwd(), "skills", skillName, path)),
  })));
  const hash = hashBytes(files.map(f => f.path + ":" + hashBytes(f.bytes)).join("\n"));
  return { name: skillName, version: "1.0.0", files, hash,
    manifestHash: hashBytes(files[0].bytes), rubricHash: hashBytes(files[1].bytes) };
}
export type SkillBundle = Awaited<ReturnType<typeof loadSkill>>;
