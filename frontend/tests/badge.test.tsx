import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, statusTone } from "@/components/ui/badge";

describe("statusTone", () => {
  it("maps RUNNING/FILLED/ACTIVE to up", () => {
    expect(statusTone("RUNNING")).toBe("up");
    expect(statusTone("FILLED")).toBe("up");
    expect(statusTone("ACTIVE")).toBe("up");
  });
  it("maps ERROR/REJECTED/CANCELLED to down", () => {
    expect(statusTone("ERROR")).toBe("down");
    expect(statusTone("REJECTED")).toBe("down");
    expect(statusTone("CANCELLED")).toBe("down");
  });
  it("maps PAUSED/STARTING/SUBMITTED to signal", () => {
    expect(statusTone("PAUSED")).toBe("signal");
    expect(statusTone("STARTING")).toBe("signal");
    expect(statusTone("SUBMITTED")).toBe("signal");
  });
  it("falls back to muted for unknown statuses", () => {
    expect(statusTone("STOPPED")).toBe("muted");
    expect(statusTone("SOMETHING_ELSE")).toBe("muted");
  });
});

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge tone="up">FILLED</Badge>);
    expect(screen.getByText("FILLED")).toBeInTheDocument();
  });
});
