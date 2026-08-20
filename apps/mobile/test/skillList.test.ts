import { describe, expect, it } from "vitest";
import { filterSkills, parseSkillList } from "../src/data/skillList";

describe("parseSkillList", () => {
  it("parses real DSH skill.list result shape", () => {
    const skills = parseSkillList({
      skills: [
        { name: "pdf", description: "读取 PDF", whenToUse: "处理 PDF", modelInvocable: true },
        { name: "xlsx", description: "读取 Excel", modelInvocable: false },
      ],
    });
    expect(skills).toEqual([
      { name: "pdf", description: "读取 PDF", whenToUse: "处理 PDF", modelInvocable: true },
      { name: "xlsx", description: "读取 Excel", modelInvocable: false },
    ]);
  });

  it("returns null for malformed results and skips invalid entries", () => {
    expect(parseSkillList(null)).toBeNull();
    expect(parseSkillList({})).toBeNull();
    expect(parseSkillList({ skills: "no" })).toBeNull();
    expect(parseSkillList({ skills: [{ name: "", description: "x", modelInvocable: true }, { name: "ok", description: "OK", modelInvocable: true }] })).toEqual([
      { name: "ok", description: "OK", modelInvocable: true },
    ]);
  });

  it("filters skills by name/description/whenToUse", () => {
    const skills = [
      { name: "pdf", description: "读取 PDF", whenToUse: "处理文档", modelInvocable: true },
      { name: "xlsx", description: "读取 Excel", modelInvocable: false },
      { name: "vision", description: "看图", whenToUse: "图片理解", modelInvocable: true },
    ];
    expect(filterSkills(skills, "")).toHaveLength(3);
    expect(filterSkills(skills, "PDF")).toEqual([skills[0]]);
    expect(filterSkills(skills, "文档")).toEqual([skills[0]]);
    expect(filterSkills(skills, "图")).toEqual([skills[2]]);
    expect(filterSkills(skills, "不存在")).toEqual([]);
  });
});
