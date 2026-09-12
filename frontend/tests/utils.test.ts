import { describe, it, expect } from "vitest";
import { formatUsd, formatPct, formatNumber, formatDateTime, cn } from "@/lib/utils";

describe("formatUsd", () => {
  it("formats a numeric string as USD with 2 decimals", () => {
    expect(formatUsd("1234.5")).toBe("$1,234.50");
  });
  it("returns an em dash for null/undefined", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
  });
  it("returns an em dash for non-numeric input", () => {
    expect(formatUsd("not-a-number")).toBe("—");
  });
});

describe("formatPct", () => {
  it("formats with 3 decimals and a percent sign", () => {
    expect(formatPct("0.15")).toBe("0.150%");
  });
});

describe("formatNumber", () => {
  it("respects the decimals argument", () => {
    expect(formatNumber("1.23456", 6)).toBe("1.234560");
  });
});

describe("formatDateTime", () => {
  it("returns an em dash for missing values", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
  it("returns an em dash for invalid dates", () => {
    expect(formatDateTime("not-a-date")).toBe("—");
  });
  it("formats a valid ISO date", () => {
    const result = formatDateTime("2026-01-15T10:30:00Z");
    expect(result).not.toBe("—");
  });
});

describe("cn", () => {
  it("merges class names and resolves tailwind conflicts", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
