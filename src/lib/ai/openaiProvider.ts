import type { AIProvider, GenerationRequest } from "./types";
import { buildResearchPrompt } from "./prompts";
import type { ResearchProject } from "@/types/research";

export class OpenAIResearchProvider implements AIProvider {
  readonly name = "OpenAI";
  constructor(private apiKey: string, private model = process.env.OPENAI_MODEL || "gpt-4.1-mini") {}
  async generate(request: GenerationRequest): Promise<ResearchProject> {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: this.model, input: buildResearchPrompt(request), text: { format: { type: "json_object" } } }) });
    if (!response.ok) throw new Error(`AI provider returned ${response.status}.`);
    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const text = payload.output_text || payload.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("") || "";
    return JSON.parse(text) as ResearchProject;
  }
}
