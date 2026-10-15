// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { ThreadUsageBadge, ThreadUsageProvider } from "./ThreadUsage";

const thread = (id: string, hostId: string | null): PluginSidebarThread => ({
  id, providerId: "claude-code", host: hostId === null ? null : { id: hostId, name: hostId },
} as PluginSidebarThread);
const payload = (usedPercent = 100, resetsAt: string | null = null) => ({
  "claude-code": { status: "ok", windows: [{ label: "Weekly limit", usedPercent, resetsAt }] },
});
const response = (body: object) => Promise.resolve({ ok: true, json: async () => body });

function Rows({ threads }: { threads: PluginSidebarThread[] }) {
  return <ThreadUsageProvider threads={threads}>{threads.map((t) => <ThreadUsageBadge key={t.id} thread={t} />)}</ThreadUsageProvider>;
}

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("thread usage badges", () => {
  it("deduplicates machine reads, isolates machines, and clears recovered limits", async () => {
    let recovered = false;
    const fetch = vi.fn((url: string) => response(payload(url.includes("hostId=h1") && !recovered ? 100 : 20)));
    vi.stubGlobal("fetch", fetch);
    render(<Rows threads={[thread("one", "h1"), thread("two", "h1"), thread("three", "h2"), thread("unknown", null)]} />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /Usage limit reached/ })).toHaveLength(2));
    expect(fetch).toHaveBeenCalledTimes(2);
    recovered = true;
    fireEvent.focus(window);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Usage limit reached/ })).toBeNull());
  });

  it("makes details available on focus and tap without triggering a parent click", async () => {
    vi.stubGlobal("fetch", vi.fn(() => response(payload())));
    const onClick = vi.fn();
    render(<div onClick={onClick}><Rows threads={[thread("one", "h1")]} /></div>);
    const label = await screen.findByRole("button", { name: /Usage limit reached/ });
    fireEvent.focus(label);
    expect(screen.getByRole("tooltip").textContent).toContain("Reset time unavailable");
    fireEvent.keyDown(label, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(label);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("clears a label when the reset passes without waiting for another poll", async () => {
    vi.useFakeTimers();
    const now = Date.parse("2026-10-15T18:00:00Z");
    vi.setSystemTime(now);
    vi.stubGlobal("fetch", vi.fn(() => response(payload(100, new Date(now + 1000).toISOString()))));
    await act(async () => { render(<Rows threads={[thread("one", "h1")]} />); });
    expect(screen.getByRole("button", { name: /Usage limit reached/ })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1001); });
    expect(screen.queryByRole("button", { name: /Usage limit reached/ })).toBeNull();
  });

  it("clears uncertain usage and pauses reads while hidden", async () => {
    const fetch = vi.fn().mockImplementationOnce(() => response(payload())).mockRejectedValue(new Error("Offline"));
    vi.stubGlobal("fetch", fetch);
    const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    render(<Rows threads={[thread("one", "h1")]} />);
    await screen.findByRole("button", { name: /Usage limit reached/ });
    visible.mockReturnValue("hidden");
    fireEvent.focus(window);
    expect(fetch).toHaveBeenCalledTimes(1);
    visible.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Usage limit reached/ })).toBeNull());
  });
});
