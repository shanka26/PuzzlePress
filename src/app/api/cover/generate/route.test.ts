import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { sampleBook } from "@/data/sample-book";

const originalGeminiKey = process.env.GEMINI_API_KEY;
const originalGoogleKey = process.env.GOOGLE_API_KEY;
const originalOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  process.env.GEMINI_API_KEY = originalGeminiKey;
  process.env.GOOGLE_API_KEY = originalGoogleKey;
  process.env.OPENAI_API_KEY = originalOpenAiKey;
  vi.unstubAllGlobals();
});

describe("cover generation route", () => {
  it("returns a clear setup error when no Google API key is configured", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const response = await POST(new Request("http://localhost/api/cover/generate", {
      method: "POST",
      body: JSON.stringify({ project: sampleBook }),
    }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("GEMINI_API_KEY");
  });

  it("returns generated image data from the Google Interactions response", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      output_image: {
        data: "iVBORw0KGgo=",
        mime_type: "image/png",
      },
    })));

    const response = await POST(new Request("http://localhost/api/cover/generate", {
      method: "POST",
      body: JSON.stringify({ project: sampleBook, style: "classic paperback", prompt: "more records" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dataUrl).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(body.model).toBe("gemini-3.1-flash-image");
    expect(body.provider).toBe("gemini");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/v1beta/interactions"), expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-goog-api-key": "test-key" }),
      body: expect.stringContaining("\"image_size\":\"4K\""),
    }));
    expect(String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).not.toContain("mime_type");
  });

  it("returns a clear setup error when no OpenAI API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST(new Request("http://localhost/api/cover/generate", {
      method: "POST",
      body: JSON.stringify({ project: sampleBook, provider: "openai" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("OPENAI_API_KEY");
  });

  it("returns generated image data from the OpenAI image response", async () => {
    process.env.OPENAI_API_KEY = "openai-test-key";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      data: [{ b64_json: "b3BlbmFpLWltYWdl" }],
    })));

    const response = await POST(new Request("http://localhost/api/cover/generate", {
      method: "POST",
      body: JSON.stringify({ project: sampleBook, provider: "openai", style: "classic paperback" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dataUrl).toBe("data:image/png;base64,b3BlbmFpLWltYWdl");
    expect(body.model).toBe("gpt-image-2");
    expect(body.provider).toBe("openai");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/v1/images/generations"), expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer openai-test-key" }),
      body: expect.stringContaining("\"model\":\"gpt-image-2\""),
    }));
  });
});
