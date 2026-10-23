import { z } from "zod";

export const dimensionDefinitions = [
  { id: "reader_relevance", label: "读者相关性", description: "读者是否关心这个具体问题" },
  { id: "specificity", label: "切入具体度", description: "对象、场景和问题是否明确" },
  { id: "evidence", label: "证据支撑", description: "是否有材料支撑主要判断" },
  { id: "cover_clarity", label: "标题清晰度", description: "能否清楚表达内容承诺" },
  { id: "followup_potential", label: "延展价值", description: "是否能讲透，并形成后续内容" },
] as const;
export const dimensionIds = dimensionDefinitions.map(d => d.id);
export const briefSchema = z.object({
  title: z.string().trim().min(2, "请填写至少两个字的选题").max(120),
  platform: z.enum(["通用", "小红书", "微信公众号"]),
  audience: z.string().trim().min(2, "请说明目标读者").max(300),
  angle: z.string().trim().min(5, "请补充读者问题和切入角度").max(6000),
  materials: z.string().trim().max(10000),
  instructions: z.string().trim().max(2000),
}).strict();
export type Brief = z.infer<typeof briefSchema>;
export const assessmentJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    summary: { type: "string" },
    verdict: { type: "string", enum: ["值得推进", "建议调整", "资料不足"] },
    dimensions: { type: "array", minItems: 5, maxItems: 5, items: {
      type: "object", additionalProperties: false,
      properties: {
        id: { type: "string", enum: dimensionIds },
        score: { type: "integer", minimum: 1, maximum: 5 },
        reason: { type: "string" }, action: { type: "string" },
      }, required: ["id", "score", "reason", "action"],
    } },
    strengths: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    missingEvidence: { type: "array", items: { type: "string" } },
    nextStep: { type: "string" },
  }, required: ["summary", "verdict", "dimensions", "strengths", "risks", "missingEvidence", "nextStep"],
};
export const assessmentSchema = z.object({
  summary: z.string().min(1),
  verdict: z.enum(["值得推进", "建议调整", "资料不足"]),
  dimensions: z.array(z.object({
    id: z.enum(["reader_relevance", "specificity", "evidence", "cover_clarity", "followup_potential"]),
    score: z.number().int().min(1).max(5), reason: z.string().min(1), action: z.string().min(1),
  }).strict()).length(5),
  strengths: z.array(z.string()), risks: z.array(z.string()), missingEvidence: z.array(z.string()),
  nextStep: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.dimensions.map(d => d.id)).size !== 5) {
    ctx.addIssue({ code: "custom", message: "五个评测维度必须各出现一次" });
  }
});
export type Assessment = z.infer<typeof assessmentSchema>;
export type Topic = { id: string; versionId: string; revision: number; brief: Brief; updatedAt: string };
export type AvailableModel = { slug: string; display_name: string };
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "needs_attention";
export type Run = {
  id: string; topicId: string; versionId: string; status: RunStatus;
  model: string; skillHash: string; result: Assessment | null; error: string | null;
  responseId: string | null; usage: unknown; skillReadVerified: boolean; createdAt: string; updatedAt: string;
};
export type Health = {
  ready: boolean; authConnected: boolean; accountName: string | null; model: string | null;
  maxDailyRuns: number; message: string;
};
export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
