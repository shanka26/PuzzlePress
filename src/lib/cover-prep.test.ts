import { describe, expect, it } from "vitest";
import { coverCropRect, coverNeedsUpscale, coverPanelTargetPixels, effectiveCoverDpi, fullCoverTargetPixels, kdpCoverGeometry, parseTrimSize, spineWidthInchesForPageCount, validateKdpCoverAssets } from "./cover-prep";

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
});
