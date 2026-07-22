import { NextResponse } from "next/server";
import type { BookProject } from "@/types/puzzle";

export const runtime = "nodejs";

const DEFAULT_MODEL = "gemini-3.1-flash-image";
const DEFAULT_OPENAI_MODEL = "gpt-image-2";

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function coverPrompt(project: BookProject, style: string, userPrompt: string) {
  const themes = project.sections.flatMap((section) => section.puzzles.map((puzzle) => puzzle.title)).slice(0, 12).join(", ");
  return [
    "Create print-quality paperback cover background artwork only.",
    "Do not include any words, letters, title text, author text, logos, barcode, QR code, signature, watermark, crop marks, or template guides.",
    "The final application will add all book text and KDP-safe layout separately.",
    "Composition: one continuous full-wrap book cover with back cover on the left, narrow spine in the center, front cover on the right.",
    "Keep the lower-right area of the left back-cover panel visually quiet for an Amazon barcode.",
    `Book series: ${clean(project.series) || "PuzzlePress"}.`,
    `Book title: ${clean(project.title)}.`,
    `Subtitle: ${clean(project.subtitle)}.`,
    `Audience: seniors who enjoy large-print nostalgic word search puzzles.`,
    themes ? `Theme cues: ${themes}.` : "",
    `Visual style: ${style}.`,
    userPrompt ? `Additional art direction: ${userPrompt}.` : "",
  ].filter(Boolean).join(" ");
}

function findImageData(value: unknown): { data: string; mimeType: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const outputImage = record.output_image as Record<string, unknown> | undefined;
  if (typeof outputImage?.data === "string") return { data: outputImage.data, mimeType: clean(outputImage.mime_type) || clean(outputImage.mimeType) || "image/png" };
  for (const key of ["data", "inlineData"]) {
    const candidate = record[key] as Record<string, unknown> | undefined;
    if (typeof candidate?.data === "string") return { data: candidate.data, mimeType: clean(candidate.mime_type) || clean(candidate.mimeType) || "image/png" };
  }
  for (const item of Object.values(record)) {
    if (Array.isArray(item)) {
      for (const child of item) {
        const found = findImageData(child);
        if (found) return found;
      }
    } else {
      const found = findImageData(item);
      if (found) return found;
    }
  }
  return undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { project?: BookProject; style?: string; prompt?: string; model?: string; provider?: "gemini" | "openai" };
    if (!body.project?.title) return NextResponse.json({ error: "Project title is required." }, { status: 400 });
    const provider = body.provider === "openai" ? "openai" : "gemini";
    const model = clean(body.model) || (provider === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_MODEL);
    const prompt = coverPrompt(body.project, clean(body.style) || "warm nostalgic commercial illustration, clean, tasteful, senior-friendly, high contrast", clean(body.prompt));
    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "Set OPENAI_API_KEY to enable OpenAI cover generation." }, { status: 503 });
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          prompt,
          size: "1536x1024",
          quality: "high",
          n: 1,
        }),
      });
      const data = await response.json().catch(() => undefined);
      if (!response.ok) return NextResponse.json({ error: data?.error?.message || "OpenAI image generation failed." }, { status: response.status });
      const first = Array.isArray(data?.data) ? data.data[0] : undefined;
      const imageData = typeof first?.b64_json === "string" ? first.b64_json : undefined;
      if (!imageData) return NextResponse.json({ error: "OpenAI response did not include generated image data." }, { status: 502 });
      return NextResponse.json({ dataUrl: `data:image/png;base64,${imageData}`, mimeType: "image/png", model, provider, prompt });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Set GEMINI_API_KEY to enable Google cover generation." }, { status: 503 });
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model,
        input: [{ type: "text", text: prompt }],
        response_format: { type: "image", aspect_ratio: "16:9", image_size: "4K" },
      }),
    });
    const data = await response.json().catch(() => undefined);
    if (!response.ok) return NextResponse.json({ error: data?.error?.message || "Google image generation failed." }, { status: response.status });
    const image = findImageData(data);
    if (!image) return NextResponse.json({ error: "Google response did not include generated image data." }, { status: 502 });
    return NextResponse.json({ dataUrl: `data:${image.mimeType};base64,${image.data}`, mimeType: image.mimeType, model, provider, prompt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cover generation failed." }, { status: 500 });
  }
}
