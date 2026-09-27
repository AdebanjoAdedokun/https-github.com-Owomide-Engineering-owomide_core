import { describe, expect, it } from "vitest";
import {
  EmailSendError,
  ZeptoMailClient,
  type Fetch,
} from "../../clients/zeptomail.js";
import { loadConfig } from "../../config.js";

const config = {
  apiUrl: "https://api.zeptomail.com/v1.1/email",
  token: "secret-token",
  fromAddress: "noreply@owomide.example",
  fromName: "Owómidé",
  timeoutMs: 5_000,
};
const email = {
  to: "tunde@example.test",
  subject: "Owómidé: review",
  text: "Body",
};

function fakeFetch(
  status: number,
  body: unknown,
): { fetchFn: Fetch; calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  const fetchFn = (async (_url: string, init: RequestInit) => {
    calls.push(init);
    return new Response(JSON.stringify(body), { status });
  }) as unknown as Fetch;
  return { fetchFn, calls };
}

describe("ZeptoMailClient", () => {
  it("sends a plain-text email with the agent token and returns the request id", async () => {
    const { fetchFn, calls } = fakeFetch(201, {
      data: [{ code: "EM_104", message: "Email request received" }],
      message: "OK",
      request_id: "req-123",
    });
    const result = await new ZeptoMailClient(config, fetchFn).send(email);
    expect(result).toEqual({ providerMessageId: "req-123" });
    const init = calls[0]!;
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Zoho-enczapikey secret-token",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      from: { address: "noreply@owomide.example", name: "Owómidé" },
      to: [{ email_address: { address: "tunde@example.test" } }],
      subject: "Owómidé: review",
      textbody: "Body",
      track_clicks: false,
      track_opens: false,
    });
  });

  it("marks rejected requests permanent and overload or outages retryable", async () => {
    const attempt = (status: number) =>
      new ZeptoMailClient(
        config,
        fakeFetch(status, {
          error: { code: "TM_3201", message: "Mandatory field missing" },
        }).fetchFn,
      ).send(email);
    await expect(attempt(400)).rejects.toMatchObject({ permanent: true });
    await expect(attempt(401)).rejects.toMatchObject({ permanent: true });
    await expect(attempt(429)).rejects.toMatchObject({ permanent: false });
    await expect(attempt(503)).rejects.toMatchObject({ permanent: false });
    await expect(attempt(400)).rejects.toThrow(
      /400: TM_3201 Mandatory field missing/,
    );
  });

  it("treats a network failure as retryable", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as Fetch;
    const error = await new ZeptoMailClient(config, failing)
      .send(email)
      .catch((e) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect(error.permanent).toBe(false);
  });
});

describe("loadConfig", () => {
  const base = {
    NOTIFY_DATABASE_URL: "postgres://notify@db/notify",
    NOTIFY_APP_BASE_URL: "https://app.owomide.example",
  };

  it("runs without email when no ZeptoMail token is set", () => {
    const cfg = loadConfig(base);
    expect(cfg.zeptomail).toBeNull();
    expect(cfg.healthPort).toBe(8080);
  });

  it("needs a sender address once email is on, and validates numbers", () => {
    expect(() => loadConfig({ ...base, ZEPTOMAIL_TOKEN: "t" })).toThrow(
      /NOTIFY_FROM_ADDRESS/,
    );
    const cfg = loadConfig({
      ...base,
      ZEPTOMAIL_TOKEN: "t",
      NOTIFY_FROM_ADDRESS: "noreply@owomide.example",
      ZEPTOMAIL_API_URL: "https://api.zeptomail.eu/v1.1/email",
    });
    expect(cfg.zeptomail?.apiUrl).toBe("https://api.zeptomail.eu/v1.1/email");
    expect(() => loadConfig({ ...base, NOTIFY_EMAIL_BATCH_SIZE: "0" })).toThrow(
      /between 1 and 200/,
    );
    expect(() =>
      loadConfig({ ...base, NOTIFY_APP_BASE_URL: "app.example" }),
    ).toThrow(/http/);
  });
});
