import type { AIProvider } from "./types";
import { MockResearchProvider } from "./mockProvider";
import { OpenAIResearchProvider } from "./openaiProvider";

export function getResearchProvider(): AIProvider {
  const key = process.env.OPENAI_API_KEY;
  return key ? new OpenAIResearchProvider(key) : new MockResearchProvider();
}
