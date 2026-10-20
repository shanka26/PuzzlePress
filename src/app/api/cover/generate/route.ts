import { NextResponse } from "next/server";
import { combinedPageCount } from "@/lib/book-pages";
import { kdpCoverGeometry, parseTrimSize } from "@/lib/cover-prep";
import type { BookProject } from "@/types/puzzle";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_MODEL = "gemini-3.1-flash-image";
const DEFAULT_OPENAI_MODEL = "gpt-image-2";
const PROVIDER_TIMEOUT_MS = 105_000;
const MAX_REFERENCE_IMAGE_BYTES = 8 * 1024 * 1024;

type CoverGenerationRole = "fullCover" | "frontCover" | "rearCover" | "spineCover";

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function parseReferenceImage(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  const match = value.match(/^data:(image\/(?:png|jpeg));base64,([a-z\d+/=]+)$/i);
  if (!match) throw new Error("Reference image must be a PNG or JPEG data URL.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) throw new Error("Reference image is empty.");
  if (bytes.length > MAX_REFERENCE_IMAGE_BYTES) throw new Error("Reference image must be smaller than 8 MB.");
  return { mimeType: match[1].toLowerCase(), base64: match[2], bytes };
}

function coverPrompt(project: BookProject, style: string, userPrompt: string, role: CoverGenerationRole) {
  const themes = project.sections.flatMap((section) => section.puzzles.map((puzzle) => puzzle.title)).slice(0, 12).join(", ");
  const template = project.assets?.kdpTemplate?.kdpValid ? project.assets.kdpTemplate.kdpTemplate : undefined;
  const trim = template ? { width: template.trimWidthInches, height: template.trimHeightInches } : parseTrimSize(project.settings.trimSize);
  const pageCount = template?.pageCount || combinedPageCount(project);
  const paperType = template?.paperType || project.settings.paperType || project.settings.interior || "white paper";
  const geometry = kdpCoverGeometry(trim, pageCount, paperType);
  const backPercent = geometry.backCover.width / geometry.fullWidthInches * 100;
  const spinePercent = geometry.spineWidthInches / geometry.fullWidthInches * 100;
  const frontPercent = geometry.frontCover.width / geometry.fullWidthInches * 100;
  const roleInstructions: Record<CoverGenerationRole, string[]> = {
    fullCover: [
      "OUTPUT TYPE: Create the flat artwork file that will be printed as a paperback cover wrap, viewed straight-on in orthographic view.",
      `EXACT PRODUCTION MAP: The final canvas is ${geometry.fullWidthInches.toFixed(6)} x ${geometry.fullHeightInches.toFixed(3)} inches for a ${trim.width} x ${trim.height} inch, ${pageCount}-page ${paperType} paperback. Treat the left ${backPercent.toFixed(3)}% as the back cover, the middle ${spinePercent.toFixed(3)}% as the spine transition, and the right ${frontPercent.toFixed(3)}% as the front cover. Create one seamless, intentional left-to-right composition across all three regions; do not draw panel outlines or guides.`,
      "The right-hand front panel must have an immediate, large-scale commercial focal image. The left-hand back must remain visually finished but calmer, with a quiet lower-right barcode area.",
    ],
    frontCover: [
      "OUTPUT TYPE: Create one portrait-format FRONT COVER artwork panel, viewed straight-on and filling the entire canvas.",
      `This panel will fill the front of a ${trim.width} x ${trim.height} inch, ${pageCount}-page ${paperType} paperback, including 0.125 inch outer, top, and bottom bleed.`,
      "Make it bold, vivid, polished, and instantly enticing at thumbnail size. Use one dominant full-scale focal scene plus layered supporting objects. Fill nearly all available real estate while preserving usable contrast behind title and author typography.",
    ],
    rearCover: [
      "OUTPUT TYPE: Create one portrait-format BACK COVER artwork panel, viewed straight-on and filling the entire canvas.",
      `This panel will fill the back of a ${trim.width} x ${trim.height} inch, ${pageCount}-page ${paperType} paperback, including 0.125 inch outer, top, and bottom bleed.`,
      "Use the same palette, era, lighting, materials, and illustration treatment as the front. Make the image visually rich at the edges while keeping the center readable for description copy and the lower-right area quiet for the Amazon barcode.",
    ],
    spineCover: [
      "OUTPUT TYPE: Create one portrait-format SPINE ART source panel, viewed straight-on and filling the entire canvas.",
      `It will be center-cropped into the ${geometry.spineWidthInches.toFixed(6)} inch spine of a ${trim.width} x ${trim.height} inch, ${pageCount}-page ${paperType} paperback.`,
      "Use a continuous coordinating background, color transition, sky, pattern, or texture that remains attractive when cropped to an extremely narrow vertical strip. Do not place focal objects or critical details in it.",
    ],
  };
  return [
    ...roleInstructions[role],
    "The artwork itself must fill the entire rectangular canvas edge to edge, including every corner, with no outer margin, empty presentation background, mat, border, or unused canvas.",
    "This is a printer's spread, not a scene or product photograph. Do not show a physical book, open book, pages, cover mockup, 3D rendering, tabletop, wall, frame, drop shadow, floating sheet, inset cover, design board, or multiple cover options.",
    "Use full-scale cover design elements; never place a small complete illustration or miniature cover inside the larger canvas.",
    "ARTWORK ONLY: Do not include any words, letters, numbers, title text, author text, logos, barcode, QR code, signature, watermark, crop marks, template lines, or printer guides. PuzzlePress will add all final typography and production marks separately.",
    `Book series: ${clean(project.series) || "PuzzlePress"}.`,
    `Book title: ${clean(project.title)}.`,
    `Subtitle: ${clean(project.subtitle)}.`,
    project.description ? `Book concept: ${clean(project.description)}.` : "",
    `Audience: seniors who enjoy large-print nostalgic word search puzzles.`,
    themes ? `Theme cues: ${themes}.` : "",
    `Visual style: ${style}.`,
    userPrompt ? `Additional visual art direction (apply only when consistent with the output and layout requirements above): ${userPrompt}.` : "",
    `FINAL CHECK: Return exactly one finished, edge-to-edge flat ${role === "fullCover" ? "cover-wrap" : role === "frontCover" ? "front-cover" : role === "rearCover" ? "back-cover" : "spine-source"} artwork image. The canvas must look like the printable artwork itself, never like a picture or presentation of that artwork.`,
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
    const body = await request.json() as { project?: BookProject; style?: string; prompt?: string; model?: string; provider?: "gemini" | "openai"; role?: CoverGenerationRole; referenceImageDataUrl?: string };
    if (!body.project?.title) return NextResponse.json({ error: "Project title is required." }, { status: 400 });
    const provider = body.provider === "openai" ? "openai" : "gemini";
    const role: CoverGenerationRole = (["fullCover", "frontCover", "rearCover", "spineCover"] as const).includes(body.role as CoverGenerationRole) ? body.role! : "fullCover";
    const model = clean(body.model) || (provider === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_MODEL);
    const referenceImage = parseReferenceImage(body.referenceImageDataUrl);
    const basePrompt = coverPrompt(body.project, clean(body.style) || "warm nostalgic commercial illustration, clean, tasteful, senior-friendly, high contrast", clean(body.prompt), role);
    const prompt = referenceImage
      ? `${basePrompt} REFERENCE IMAGE: Use the attached source image only as visual direction for palette, era, mood, materials, composition, and subject cues. Create a new original result fitted to this cover panel. Do not reproduce any text, logo, watermark, signature, border, or exact branded element from the reference.`
      : basePrompt;
    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "Set OPENAI_API_KEY to enable OpenAI cover generation." }, { status: 503 });
      const requestBody = referenceImage ? new FormData() : undefined;
      if (requestBody && referenceImage) {
        requestBody.append("model", model);
        requestBody.append("prompt", prompt);
        requestBody.append("image[]", new Blob([referenceImage.bytes], { type: referenceImage.mimeType }), referenceImage.mimeType === "image/png" ? "reference.png" : "reference.jpg");
        requestBody.append("size", role === "fullCover" ? "1536x1024" : "1024x1536");
        requestBody.append("quality", "high");
        requestBody.append("output_format", "jpeg");
        requestBody.append("output_compression", "86");
        requestBody.append("n", "1");
      }
      const response = await fetch(referenceImage ? "https://api.openai.com/v1/images/edits" : "https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: referenceImage ? { Authorization: `Bearer ${apiKey}` } : { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: requestBody || JSON.stringify({
          model,
          prompt,
          size: role === "fullCover" ? "1536x1024" : "1024x1536",
          quality: "high",
          output_format: "jpeg",
          output_compression: 86,
          n: 1,
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      const data = await response.json().catch(() => undefined);
      if (!response.ok) return NextResponse.json({ error: data?.error?.message || "OpenAI image generation failed." }, { status: response.status });
      const first = Array.isArray(data?.data) ? data.data[0] : undefined;
      const imageData = typeof first?.b64_json === "string" ? first.b64_json : undefined;
      if (!imageData) return NextResponse.json({ error: "OpenAI response did not include generated image data." }, { status: 502 });
      return NextResponse.json({ dataUrl: `data:image/jpeg;base64,${imageData}`, mimeType: "image/jpeg", model, provider, prompt, role });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Set GEMINI_API_KEY to enable Google cover generation." }, { status: 503 });
    const response = await fetch(referenceImage ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` : "https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(referenceImage ? {
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.base64 } }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: role === "fullCover" ? "16:9" : "2:3" } },
      } : {
        model,
        input: [{ type: "text", text: prompt }],
        response_format: { type: "image", aspect_ratio: role === "fullCover" ? "16:9" : "2:3", image_size: "4K" },
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => undefined);
    if (!response.ok) return NextResponse.json({ error: data?.error?.message || "Google image generation failed." }, { status: response.status });
    const image = findImageData(data);
    if (!image) return NextResponse.json({ error: "Google response did not include generated image data." }, { status: 502 });
    return NextResponse.json({ dataUrl: `data:${image.mimeType};base64,${image.data}`, mimeType: image.mimeType, model, provider, prompt, role });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const message = error instanceof Error ? error.message : "Cover generation failed.";
    const inputError = message.startsWith("Reference image");
    return NextResponse.json({ error: timedOut ? "The image provider did not finish within 105 seconds. Try this panel again or switch providers." : message }, { status: timedOut ? 504 : inputError ? (message.includes("8 MB") ? 413 : 400) : 500 });
  }
}
