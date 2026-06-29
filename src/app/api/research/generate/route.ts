import { NextResponse } from "next/server";
import { getResearchProvider } from "@/lib/ai/provider";
import type { GenerationRequest } from "@/lib/ai/types";

export async function POST(request: Request) {
  try {
    const body = await request.json() as GenerationRequest;
    const provider = getResearchProvider();
    return NextResponse.json({ project: await provider.generate(body), provider: provider.name });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Generation failed." }, { status: 400 });
  }
}
