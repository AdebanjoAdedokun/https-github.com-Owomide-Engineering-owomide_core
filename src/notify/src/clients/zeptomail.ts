// Zoho ZeptoMail transactional email API (POST /v1.1/email, "Zoho-enczapikey" authorisation).
// Only plain-text bodies are sent: the templates are plain text, and no tracking is requested.

export interface ZeptoMailConfig {
  /** e.g. https://api.zeptomail.com/v1.1/email (regional hosts differ, e.g. api.zeptomail.eu). */
  apiUrl: string;
  /** The "Send Mail" token from the ZeptoMail agent, without the "Zoho-enczapikey" prefix. */
  token: string;
  fromAddress: string;
  fromName: string;
  timeoutMs: number;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/** permanent: retrying the same request cannot succeed (bad address, rejected content, auth). */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

export type Fetch = typeof fetch;

export interface EmailSender {
  send(email: OutgoingEmail): Promise<{ providerMessageId: string }>;
}

export class ZeptoMailClient implements EmailSender {
  constructor(
    private readonly config: ZeptoMailConfig,
    private readonly fetchFn: Fetch = fetch,
  ) {}

  async send(email: OutgoingEmail): Promise<{ providerMessageId: string }> {
    let response: Response;
    try {
      response = await this.fetchFn(this.config.apiUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Zoho-enczapikey ${this.config.token}`,
        },
        body: JSON.stringify({
          from: {
            address: this.config.fromAddress,
            name: this.config.fromName,
          },
          to: [{ email_address: { address: email.to } }],
          subject: email.subject,
          textbody: email.text,
          track_clicks: false,
          track_opens: false,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      // Network failure or timeout: the email may or may not have been accepted; retry later.
      throw new EmailSendError(
        `ZeptoMail unreachable: ${(error as Error).message}`,
        false,
      );
    }

    const body = (await response.json().catch(() => ({}))) as {
      request_id?: unknown;
      data?: { request_id?: unknown };
      error?: { code?: unknown; message?: unknown };
    };
    if (response.ok) {
      const id = body.request_id ?? body.data?.request_id;
      return {
        providerMessageId: typeof id === "string" && id ? id : "unknown",
      };
    }
    const detail = [body.error?.code, body.error?.message]
      .filter(Boolean)
      .join(" ");
    const message = `ZeptoMail ${response.status}${detail ? `: ${detail}` : ""}`;
    // 408, 425, 429 and 5xx are worth retrying; any other 4xx will fail the same way again.
    const retryable =
      response.status >= 500 || [408, 425, 429].includes(response.status);
    throw new EmailSendError(message, !retryable);
  }
}
