import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

describe("test environment smoke test", () => {
  it("runs basic assertions", () => {
    expect(1 + 1).toBe(2);
  });

  it("renders a React component via jsdom + Testing Library", () => {
    render(<HomePage />);
    expect(screen.getByText("Government Jobs Eligibility Platform")).toBeInTheDocument();
  });
});
