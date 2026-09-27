import { describe, expect, it } from "vitest";
import {
  AiUnavailableError,
  prepareSummaryInput,
  redactCostData,
  summariseProposal,
  SUMMARY_MODEL,
  type MessagesClient,
} from "../../ai/proposal-summary.js";

const snapshot = {
  proposal_id: "p-1",
  version_number: 2,
  lines: [
    {
      sku_id: "BEV-00001",
      product_name: "Sunvale Orange Juice 1L",
      current_price_minor: 107500,
      proposed_price_minor: 118000,
      applicable_unit_cost_minor: 90000,
      proposed_margin_pct: "18.0085",
      guardrails: [{ id: "min-margin-15", state: "Within Guardrail", markup_pct: "21.9" }],
    },
  ],
};

/** A fake SDK client that records the request and returns a canned response. */
function fakeClient(response: Record<string, unknown>) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        create: async (params: Record<string, unknown>) => {
          calls.push(params);
          return response;
        },
      },
    },
  } as unknown as MessagesClient;
  return { client, calls };
}

describe("AI data policy", () => {
  it("sends nothing when AI is switched off", () => {
    expect(() => prepareSummaryInput(snapshot, "disabled")).toThrow(AiUnavailableError);
  });

  it("removes every cost-derived field at any depth when the policy says so", () => {
    const input = prepareSummaryInput(snapshot, "enabled_without_cost_margin");
    const keys: string[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, inner] of Object.entries(v)) {
          keys.push(k);
          walk(inner);
        }
      }
    };
    walk(JSON.parse(input.payload));
    expect(keys.filter((k) => /cost|margin|markup|profit/i.test(k))).toEqual([]);
    expect(input.payload).not.toMatch(/90000|18\.0085|21\.9/);
    expect(input.payload).toContain("118000");
    expect(input.payload).toContain("Sunvale Orange Juice 1L");
    expect(input.inputSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sends everything under the full policy, and the hash changes with the data", () => {
    const full = prepareSummaryInput(snapshot, "enabled");
    const redacted = prepareSummaryInput(snapshot, "enabled_without_cost_margin");
    expect(full.payload).toContain("18.0085");
    expect(full.inputSha256).not.toBe(redacted.inputSha256);
  });

  it("does not touch values, only keys", () => {
    expect(redactCostData({ type: "cost_driven_repricing", cost: 1 })).toEqual({
      type: "cost_driven_repricing",
    });
  });

  it("removes margin and markup check results, whose figures hide behind other field names", () => {
    const line = {
      sku_id: "sku-1",
      proposed_price_minor: 118000,
      guardrails: [
        {
          guardrail: { kind: "min_margin", threshold: 15 },
          state: "Breach",
          actual: 12.3,
          gap: -2.7,
        },
        { kind: "markup_floor", status: "Within", actual: 31 },
        { guardrail: { kind: "max_increase", threshold: 12 }, state: "Within", actual: 8, gap: 4 },
      ],
    };
    expect(redactCostData(line)).toEqual({
      sku_id: "sku-1",
      proposed_price_minor: 118000,
      guardrails: [
        { guardrail: { kind: "max_increase", threshold: 12 }, state: "Within", actual: 8, gap: 4 },
      ],
    });
  });

  it("keeps a record whose type mentions cost when it carries no check result", () => {
    expect(
      redactCostData({ type: "cost_driven_repricing", title: "Supplier increase", objective: "x" })
    ).toEqual({ type: "cost_driven_repricing", title: "Supplier increase", objective: "x" });
  });
});

describe("summariseProposal", () => {
  const input = prepareSummaryInput(snapshot, "enabled_without_cost_margin");

  it("asks the default model with fallbacks on, and returns the answering model", async () => {
    const { client, calls } = fakeClient({
      model: "claude-opus-4-8",
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: "  One beverage price rises by 9.8%.  " },
      ],
    });
    const result = await summariseProposal(client, input);
    expect(result).toEqual({ model: "claude-opus-4-8", text: "One beverage price rises by 9.8%." });
    expect(calls[0]).toMatchObject({
      model: SUMMARY_MODEL,
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
    });
    // The customer data travels as tagged data in the user turn, not in the system prompt.
    const messages = calls[0]!.messages as { content: string }[];
    expect(messages[0]!.content).toBe(`<proposal>${input.payload}</proposal>`);
    expect(String(calls[0]!.system)).not.toContain("Sunvale");
  });

  it("stores nothing when the whole chain refuses or returns nothing", async () => {
    await expect(
      summariseProposal(
        fakeClient({ model: "m", stop_reason: "refusal", content: [] }).client,
        input
      )
    ).rejects.toMatchObject({ code: "AI_REFUSED" });
    await expect(
      summariseProposal(
        fakeClient({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: " " }] })
          .client,
        input
      )
    ).rejects.toMatchObject({ code: "AI_EMPTY_OUTPUT" });
    await expect(
      summariseProposal(
        fakeClient({
          model: "m",
          stop_reason: "end_turn",
          content: [{ type: "text", text: "x".repeat(4001) }],
        }).client,
        input
      )
    ).rejects.toMatchObject({ code: "AI_OUTPUT_TOO_LONG" });
  });
});
