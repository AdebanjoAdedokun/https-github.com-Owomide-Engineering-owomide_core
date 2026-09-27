export interface NotifyConfig {
  databaseUrl: string;
  kafkaBroker: string;
  logLevel: string;
  host: string;
  healthPort: number;
  /** Workspace origin used for links in emails. */
  appBaseUrl: string;
  /** Unset means email sending is off; in-app notifications still work. */
  zeptomail: {
    apiUrl: string;
    token: string;
    fromAddress: string;
    fromName: string;
    timeoutMs: number;
  } | null;
  emailBatchSize: number;
  emailPollMs: number;
  emailMaxAttempts: number;
}

type Env = Readonly<Record<string, string | undefined>>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function integer(
  env: Env,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function loadConfig(env: Env = process.env): NotifyConfig {
  const appBaseUrl = required(env, "NOTIFY_APP_BASE_URL");
  if (!/^https?:\/\//.test(appBaseUrl))
    throw new Error("NOTIFY_APP_BASE_URL must be an http(s) URL");
  const token = env.ZEPTOMAIL_TOKEN?.trim();
  return {
    databaseUrl: required(env, "NOTIFY_DATABASE_URL"),
    kafkaBroker: env.KAFKA_BROKER?.trim() || "kafka:9092",
    logLevel: env.LOG_LEVEL?.trim() || "info",
    host: env.NOTIFY_HOST?.trim() || "0.0.0.0",
    healthPort: integer(env, "NOTIFY_HEALTH_PORT", 8080, 1, 65535),
    appBaseUrl,
    zeptomail: token
      ? {
          apiUrl:
            env.ZEPTOMAIL_API_URL?.trim() ||
            "https://api.zeptomail.com/v1.1/email",
          token,
          fromAddress: required(env, "NOTIFY_FROM_ADDRESS"),
          fromName: env.NOTIFY_FROM_NAME?.trim() || "Owómidé",
          timeoutMs: integer(
            env,
            "ZEPTOMAIL_TIMEOUT_MS",
            10_000,
            1_000,
            60_000,
          ),
        }
      : null,
    emailBatchSize: integer(env, "NOTIFY_EMAIL_BATCH_SIZE", 50, 1, 200),
    emailPollMs: integer(env, "NOTIFY_EMAIL_POLL_MS", 5_000, 100, 600_000),
    emailMaxAttempts: integer(env, "NOTIFY_EMAIL_MAX_ATTEMPTS", 8, 1, 50),
  };
}
