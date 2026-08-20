/**
 * skillList — 解析宿主 skill.list 响应（纯 TS，零 RN 依赖，可单测）。
 * 契约来自真实 DSH skills.schema.js：
 *   { skills: Array<{ name: string; description: string; whenToUse?: string; modelInvocable: boolean }> }
 * 解析失败返回 null（UI 自动隐藏技能入口），与 ConnectionProvider 的读不到/离线约定一致。
 */

export interface SkillEntry {
  name: string;
  description: string;
  whenToUse?: string;
  modelInvocable: boolean;
}

export function parseSkillList(result: unknown): SkillEntry[] | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const skills = (result as Record<string, unknown>).skills;
  if (!Array.isArray(skills)) return null;
  const out: SkillEntry[] = [];
  for (const item of skills) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const description = typeof rec.description === "string" ? rec.description : "";
    if (!name || !description) continue;
    if (typeof rec.modelInvocable !== "boolean") continue;
    out.push({
      name,
      description,
      ...(typeof rec.whenToUse === "string" && rec.whenToUse.length > 0
        ? { whenToUse: rec.whenToUse }
        : {}),
      modelInvocable: rec.modelInvocable,
    });
  }
  return out;
}

/** 本地模糊过滤技能（name / description / whenToUse，不区分大小写）。 */
export function filterSkills(skills: SkillEntry[], query: string): SkillEntry[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return skills;
  return skills.filter((s) => {
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      (s.whenToUse ?? "").toLowerCase().includes(q)
    );
  });
}
