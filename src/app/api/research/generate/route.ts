import { NextResponse } from "next/server";
import { getResearchProvider } from "@/lib/ai/provider";
import { validateGeneratedCounts, validateResearchInput, type GenerationRequest } from "@/lib/ai/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as GenerationRequest;
    const inputErrors = validateResearchInput(body.input);
    if (inputErrors.length) return NextResponse.json({ error: inputErrors.join(" ") }, { status: 400 });
    const provider = getResearchProvider();
    const project = await provider.generate(body);
    const countErrors = validateGeneratedCounts(project, body.input);
    if (countErrors.length) return NextResponse.json({ error: countErrors.join(" ") }, { status: 422 });
    return NextResponse.json({ project, provider: provider.name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Generation failed." }, { status: 400 });
  }
}
