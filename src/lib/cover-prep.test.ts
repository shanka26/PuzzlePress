import { describe, expect, it } from "vitest";
import { buildCoverRepairDiagnostic, coverAssetValidForPromptRole, coverCropRect, coverImageEditPrompt, coverNeedsUpscale, coverPanelTargetPixels, coverRepairAgentPrompt, coverRepairFallbackPrompt, effectiveCoverDpi, fullCoverTargetPixels, kdpCoverGeometry, parseTrimSize, spineWidthInchesForPageCount, validateKdpCoverAssets } from "./cover-prep";

describe("cover prep", () => {
  it("calculates 300 DPI cover panel target pixels with bleed", () => {
    expect(coverPanelTargetPixels({ width: 8.5, height: 11 })).toEqual({ width: 2588, height: 3375 });
    expect(coverPanelTargetPixels({ width: 6, height: 9 })).toEqual({ width: 1838, height: 2775 });
  });

  it("calculates one-piece full-cover target pixels with spine and bleed", () => {
    expect(spineWidthInchesForPageCount(100, "white paper")).toBeCloseTo(.2252, 4);
    expect(fullCoverTargetPixels({ width: 8.5, height: 11 }, 100, "white paper")).toEqual({ width: 5243, height: 3375 });
  });

  it("reports authoritative KDP full-wrap geometry from final page count", () => {
    const geometry = kdpCoverGeometry({ width: 8.5, height: 11 }, 66, "white paper");
    expect(geometry.spineWidthInches).toBeCloseTo(.148632, 6);
    expect(geometry.fullWidthInches).toBeCloseTo(17.398632, 6);
    expect(geometry.fullHeightInches).toBe(11.25);
    expect(geometry.backCover.x).toBe(0);
    expect(geometry.frontCover.x).toBeCloseTo(8.625 + .148632, 6);
  });

  it("parses common trim-size strings with a stable default", () => {
    expect(parseTrimSize("6 x 9")).toEqual({ width: 6, height: 9 });
    expect(parseTrimSize("8.5 × 11")).toEqual({ width: 8.5, height: 11 });
    expect(parseTrimSize()).toEqual({ width: 8.5, height: 11 });
  });

  it("computes effective cover DPI against the bleed panel", () => {
    const trim = { width: 8.5, height: 11 };
    expect(Math.floor(effectiveCoverDpi(2588, 3375, trim) || 0)).toBe(300);
    expect(Math.floor(effectiveCoverDpi(1294, 1688, trim) || 0)).toBe(150);
  });

  it("returns centered crop-to-fill rectangles", () => {
    expect(coverCropRect({ width: 4000, height: 3000 }, { width: 1800, height: 2700 })).toEqual({ sx: 1000, sy: 0, sw: 2000, sh: 3000 });
    expect(coverCropRect({ width: 2000, height: 4000 }, { width: 1800, height: 2700 })).toEqual({ sx: 0, sy: 500, sw: 2000, sh: 3000 });
  });

  it("flags cover panels that need upscaling after crop", () => {
    const target = { width: 2588, height: 3375 };
    expect(coverNeedsUpscale({ width: 1200, height: 1800 }, coverCropRect({ width: 1200, height: 1800 }, target), target)).toBe(true);
    expect(coverNeedsUpscale({ width: 3200, height: 4200 }, coverCropRect({ width: 3200, height: 4200 }, target), target)).toBe(false);
  });

  it("rejects cover export assets that are not prepared at exact 300 DPI KDP dimensions", () => {
    const trim = { width: 8.5, height: 11 };
    const fullTarget = fullCoverTargetPixels(trim, 66, "white paper");
    expect(validateKdpCoverAssets({ trim, pageCount: 66, paperType: "white paper", fullCover: { width: 1, height: 1, targetWidth: fullTarget.width, targetHeight: fullTarget.height, processedFor: "kdp-full-cover" } }).result).toBe("FAIL");
    expect(validateKdpCoverAssets({ trim, pageCount: 66, paperType: "white paper", fullCover: { width: fullTarget.width, height: fullTarget.height, targetWidth: fullTarget.width, targetHeight: fullTarget.height, processedFor: "kdp-full-cover" } }).result).toBe("PASS");
  });

  it("builds an actionable image-agent prompt for an invalid cover", () => {
    const prompt = coverImageEditPrompt({
      name: "cover.jpg",
      width: 5298,
      height: 3375,
      originalWidth: 1600,
      originalHeight: 1020,
      targetWidth: 5298,
      targetHeight: 3375,
      processedFor: "kdp-full-cover",
      upscaled: true,
      validationMessages: ["Source is too small after crop."],
    }, "Source wrap art");

    expect(prompt).toContain("exactly 5298 x 3375 pixels");
    expect(prompt).toContain("Source is too small after crop.");
    expect(prompt).toContain("do not merely stretch or upscale");
    expect(prompt).toContain("Keep this source artwork text-free");
    expect(prompt).toContain("17.659864 x 11.25 inches at 300 DPI");
    expect(prompt).toContain("spine x=8.625000 to 9.034864 in (0.409864 in wide)");
    expect(prompt).toContain("barcode reservation clear");
  });

  it("includes exact trim and bleed measurements for a separate cover panel", () => {
    const prompt = coverImageEditPrompt({
      name: "back.jpg",
      width: 2588,
      height: 3375,
      targetWidth: 2588,
      targetHeight: 3375,
      processedFor: "kdp-cover-panel",
    }, "Back cover");

    expect(prompt).toContain("8.625 x 11.25 inches at 300 DPI");
    expect(prompt).toContain("8.500 x 11.00 inches");
    expect(prompt).toContain("left/back outside edge");
  });

  it("builds a full-wrap prompt for a legacy asset without processing metadata", () => {
    const prompt = coverImageEditPrompt({
      name: "legacy-wrap.jpg",
      width: 1800,
      height: 1200,
      validationMessages: ["Legacy cover has not been prepared for current export requirements."],
    }, "Full wrap cover", "fullCover");

    expect(prompt).toContain("one-piece full-wrap cover artwork");
    expect(prompt).toContain("5298 x 3375 pixels");
    expect(prompt).toContain("17.659864 x 11.25 inches");
  });

  it("keeps the prompt action available for every invalid full-wrap state", () => {
    const valid = {
      mimeType: "image/png",
      width: 5298,
      height: 3375,
      targetWidth: 5298,
      targetHeight: 3375,
      processedFor: "kdp-full-cover",
      kdpValid: true,
    };

    expect(coverAssetValidForPromptRole(valid, "fullCover")).toBe(true);
    expect(coverAssetValidForPromptRole({ ...valid, processedFor: undefined }, "fullCover")).toBe(false);
    expect(coverAssetValidForPromptRole({ ...valid, processedFor: "kdp-cover-panel" }, "fullCover")).toBe(false);
    expect(coverAssetValidForPromptRole({ ...valid, width: 2400, kdpValid: false }, "fullCover")).toBe(false);
    expect(coverAssetValidForPromptRole({ ...valid, upscaled: true, kdpValid: false }, "fullCover")).toBe(false);
    expect(coverAssetValidForPromptRole({ ...valid, mimeType: "image/webp" }, "fullCover")).toBe(false);
  });

  it("applies the same prompt-action validity rule to front and rear panels", () => {
    const validPanel = {
      mimeType: "image/jpeg",
      width: 2588,
      height: 3375,
      targetWidth: 2588,
      targetHeight: 3375,
      processedFor: "kdp-cover-panel",
      kdpValid: true,
    };

    expect(coverAssetValidForPromptRole(validPanel, "frontCover")).toBe(true);
    expect(coverAssetValidForPromptRole(validPanel, "rearCover")).toBe(true);
    expect(coverAssetValidForPromptRole({ ...validPanel, processedFor: undefined }, "frontCover")).toBe(false);
    expect(coverAssetValidForPromptRole({ ...validPanel, targetWidth: 1200, kdpValid: false }, "rearCover")).toBe(false);
    expect(coverAssetValidForPromptRole(undefined, "frontCover")).toBe(false);
  });

  it("serializes exact KDP repair measurements, failures, and official guidance", () => {
    const diagnostic = buildCoverRepairDiagnostic({
      name: "invalid-wrap.png",
      mimeType: "image/png",
      width: 5298,
      height: 3375,
      originalWidth: 1600,
      originalHeight: 1000,
      processedFor: "kdp-full-cover",
      targetWidth: 5298,
      targetHeight: 3375,
      upscaled: true,
      kdpValid: false,
      validationMessages: ["Source is too small after crop."],
    }, "Full cover", "fullCover", 1);

    expect(diagnostic.schemaVersion).toBe("puzzlepress.kdp-cover-repair.v1");
    expect(diagnostic.target.pixels).toEqual({ width: 5298, height: 3375 });
    expect(diagnostic.target.inches.width).toBeCloseTo(17.659864, 6);
    expect(diagnostic.target.inches.height).toBe(11.25);
    expect(diagnostic.target.spineWidthInches).toBeCloseTo(.409864, 6);
    expect(diagnostic.validation.issues.join(" ")).toMatch(/too small|upscaling/i);
    expect(diagnostic.kdpGuidelines.officialSources.every((source) => source.startsWith("https://kdp.amazon.com/"))).toBe(true);
    expect(coverRepairAgentPrompt(diagnostic)).toContain(JSON.stringify(diagnostic, null, 2));
  });

  it("creates a copyable fallback prompt from the final repair JSON", () => {
    const diagnostic = buildCoverRepairDiagnostic({
      name: "invalid-front.jpg",
      mimeType: "image/jpeg",
      width: 900,
      height: 1200,
      upscaled: true,
      kdpValid: false,
    }, "Front cover", "frontCover", 2, [{ attempt: 1, provider: "gemini", model: "gemini-3.1-flash-image", valid: false, issues: ["Too small"] }]);
    const prompt = coverRepairFallbackPrompt(diagnostic);

    expect(prompt).toContain("RAW KDP REPAIR JSON");
    expect(prompt).toContain("2588 x 3375 pixels");
    expect(prompt).toContain('"attempt": 2');
    expect(prompt).toContain('"maximumAttempts": 2');
  });
});
