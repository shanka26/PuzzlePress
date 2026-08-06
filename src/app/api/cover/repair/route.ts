import { NextResponse } from "next/server";
import { buildCoverRepairDiagnostic, coverRepairAgentPrompt, type CoverPromptRole, type CoverRepairAttempt, type CoverRepairDiagnostic } from "@/lib/cover-prep";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-image";
const DEFAULT_OPENAI_MODEL = "gpt-image-2";
const DEFAULT_GATEWAY_MODEL = "google/gemini-3.1-flash-image-preview";
const MAX_REQUEST_BYTES = 4_000_000;
const MAX_IMAGE_DATA_URL_LENGTH = 3_300_000;
const PROVIDER_TIMEOUT_MS = 90_000;

type RepairProvider = "auto" | "gemini" | "openai";

interface RepairRequest {
  diagnostic?: CoverRepairDiagnostic;
  imageDataUrl?: string;
  provider?: RepairProvider;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function parseImageDataUrl(value: string, maximumLength = MAX_IMAGE_DATA_URL_LENGTH) {
  if (value.length > maximumLength) return undefined;
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (!match) return undefined;
  return { mimeType: match[1], data: match[2].replace(/\s+/g, "") };
}

function finiteDimension(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

function safeMessages(value: unknown) {
  return Array.isArray(value)
    ? value.map(clean).filter(Boolean).slice(0, 12).map((message) => message.slice(0, 300))
    : [];
}

function normalizeDiagnostic(value: unknown, mimeType: string): CoverRepairDiagnostic | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Partial<CoverRepairDiagnostic>;
  const role = input.task?.role;
  if (input.schemaVersion !== "puzzlepress.kdp-cover-repair.v1"
    || input.validation?.status !== "FAIL"
    || !(["fullCover", "frontCover", "rearCover"] as CoverPromptRole[]).includes(role as CoverPromptRole)) return undefined;
  const attempt = input.task?.attempt;
  if (!Number.isInteger(attempt) || attempt! < 1 || attempt! > 2 || input.task?.maximumAttempts !== 2) return undefined;

  const source = input.sourceAsset;
  const processedFor = source?.processedFor === "kdp-full-cover" || source?.processedFor === "kdp-cover-panel"
    ? source.processedFor
    : undefined;
  const history: CoverRepairAttempt[] = Array.isArray(input.attemptHistory)
    ? input.attemptHistory.slice(0, 2).flatMap((item) => {
      if (!item || (item.provider !== "gemini" && item.provider !== "openai")) return [];
      return [{
        attempt: item.attempt === 2 ? 2 : 1,
        provider: item.provider,
        model: clean(item.model).slice(0, 100) || "image-edit-model",
        valid: Boolean(item.valid),
        issues: safeMessages(item.issues),
        error: clean(item.error).slice(0, 300) || undefined,
      }];
    })
    : [];
  const trustedRole = role as CoverPromptRole;
  const label = trustedRole === "fullCover" ? "Full cover" : trustedRole === "frontCover" ? "Front cover" : "Back cover";
  return buildCoverRepairDiagnostic({
    name: clean(source?.name).slice(0, 120) || "uploaded-cover",
    mimeType,
    originalWidth: finiteDimension(source?.sourcePixels?.width),
    originalHeight: finiteDimension(source?.sourcePixels?.height),
    width: finiteDimension(source?.currentPixels?.width),
    height: finiteDimension(source?.currentPixels?.height),
    targetWidth: finiteDimension(source?.declaredTargetPixels?.width),
    targetHeight: finiteDimension(source?.declaredTargetPixels?.height),
    processedFor,
    upscaled: Boolean(source?.upscaled),
    kdpValid: false,
    validationMessages: safeMessages(input.validation?.issues),
  }, label, trustedRole, attempt!, history);
}

function findImageData(value: unknown): { data: string; mimeType: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const inline = (record.inlineData || record.inline_data) as Record<string, unknown> | undefined;
  if (typeof inline?.data === "string") {
    return { data: inline.data, mimeType: clean(inline.mimeType) || clean(inline.mime_type) || "image/png" };
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

function gatewayToken() {
  return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
}

function resolveProvider(requested: RepairProvider | undefined): "gemini" | "openai" | "gateway" | undefined {
  if (requested === "gemini") return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? "gemini" : gatewayToken() ? "gateway" : undefined;
  if (requested === "openai") return process.env.OPENAI_API_KEY ? "openai" : gatewayToken() ? "gateway" : undefined;
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (gatewayToken()) return "gateway";
  return undefined;
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Cover repair request is too large." }, { status: 413 });
    }
    const body = await request.json() as RepairRequest;
    const image = parseImageDataUrl(body.imageDataUrl || "");
    if (!image) return NextResponse.json({ error: "A PNG or JPEG source image is required." }, { status: 400 });
    const diagnostic = normalizeDiagnostic(body.diagnostic, image.mimeType);
    if (!diagnostic) return NextResponse.json({ error: "A valid failed-cover diagnostic JSON object is required." }, { status: 400 });

    const provider = resolveProvider(body.provider);
    if (!provider) {
      const requested = body.provider === "openai" ? "OpenAI or Vercel AI Gateway" : body.provider === "gemini" ? "Gemini or Vercel AI Gateway" : "Gemini, OpenAI, or Vercel AI Gateway";
      return NextResponse.json({ error: `No configured image-editing provider is available. Enable ${requested}.`, code: "IMAGE_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
    }

    const prompt = coverRepairAgentPrompt(diagnostic);
    if (provider === "gateway") {
      const model = DEFAULT_GATEWAY_MODEL;
      const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${gatewayToken()}` },
        body: JSON.stringify({
          model,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}`, detail: "high" } },
            ],
          }],
          modalities: ["text", "image"],
          stream: false,
        }),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      const data = await response.json().catch(() => undefined);
      if (!response.ok) return NextResponse.json({ error: data?.error?.message || "Vercel AI Gateway cover repair failed." }, { status: response.status });
      const images = data?.choices?.[0]?.message?.images;
      const dataUrl = Array.isArray(images) ? images.find((item: { image_url?: { url?: unknown } }) => typeof item?.image_url?.url === "string")?.image_url?.url : undefined;
      const repaired = typeof dataUrl === "string" ? parseImageDataUrl(dataUrl, 16_000_000) : undefined;
      if (!repaired) return NextResponse.json({ error: "Vercel AI Gateway did not return an edited image." }, { status: 502 });
      return NextResponse.json({ dataUrl, mimeType: repaired.mimeType, model, provider: "gemini", prompt, gateway: true });
    }

    if (provider === "openai") {
      const model = DEFAULT_OPENAI_MODEL;
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("image", new Blob([Buffer.from(image.data, "base64")], { type: image.mimeType }), `cover-attempt-${diagnostic.task.attempt}.${image.mimeType === "image/jpeg" ? "jpg" : "png"}`);
      form.append("size", diagnostic.task.role === "fullCover" ? "1536x1024" : "1024x1536");
      form.append("quality", "high");
      form.append("input_fidelity", "high");
      form.append("n", "1");
      const response = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      const data = await response.json().catch(() => undefined);
      if (!response.ok) return NextResponse.json({ error: data?.error?.message || "OpenAI cover repair failed." }, { status: response.status });
      const first = Array.isArray(data?.data) ? data.data[0] : undefined;
      if (typeof first?.b64_json !== "string") return NextResponse.json({ error: "OpenAI did not return an edited image." }, { status: 502 });
      return NextResponse.json({ dataUrl: `data:image/png;base64,${first.b64_json}`, mimeType: "image/png", model, provider, prompt });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const model = DEFAULT_GEMINI_MODEL;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey! },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: image.mimeType, data: image.data } }] }],
        generationConfig: {
          responseModalities: ["Image"],
          responseFormat: {
            image: {
              aspectRatio: diagnostic.task.role === "fullCover" ? "3:2" : "3:4",
              imageSize: "4K",
            },
          },
        },
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const data = await response.json().catch(() => undefined);
    if (!response.ok) return NextResponse.json({ error: data?.error?.message || "Gemini cover repair failed." }, { status: response.status });
    const repaired = findImageData(data);
    if (!repaired) return NextResponse.json({ error: "Gemini did not return an edited image." }, { status: 502 });
    return NextResponse.json({ dataUrl: `data:${repaired.mimeType};base64,${repaired.data}`, mimeType: repaired.mimeType, model, provider, prompt });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Cover repair request must be valid JSON." }, { status: 400 });
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return NextResponse.json({ error: "The image-editing provider timed out. Copy the manual repair prompt and try again." }, { status: 504 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cover repair failed." }, { status: 500 });
  }
}
