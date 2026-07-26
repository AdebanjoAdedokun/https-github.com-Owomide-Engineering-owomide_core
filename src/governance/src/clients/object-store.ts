import { Client as MinioClient } from "minio";

export interface ObjectStoreConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  secure: boolean;
  bucket: string;
}

export class ObjectStore {
  private readonly client: MinioClient;
  private readonly bucket: string;

  constructor(config: ObjectStoreConfig) {
    const [host, portStr] = config.endpoint.split(":");
    this.client = new MinioClient({
      endPoint: host!,
      port: portStr ? Number(portStr) : undefined,
      useSSL: config.secure,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
    this.bucket = config.bucket;
  }

  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (exists) return;
    try {
      await this.client.makeBucket(this.bucket);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== "BucketAlreadyExists" && code !== "BucketAlreadyOwnedByYou") throw err;
    }
  }

  async ready(): Promise<boolean> {
    try {
      await this.ensureBucket();
      return true;
    } catch {
      return false;
    }
  }

  async putObject(
    key: string,
    data: Buffer,
    contentType: string,
  ): Promise<{ url: string; etag: string }> {
    await this.ensureBucket();
    const result = await this.client.putObject(this.bucket, key, data, data.length, {
      "Content-Type": contentType,
    });
    return {
      url: `s3://${this.bucket}/${key}`,
      etag: result.etag,
    };
  }

  async getObject(url: string): Promise<Buffer> {
    const { bucket, key } = this.parseUrl(url);
    const stream = await this.client.getObject(bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }
    return Buffer.concat(chunks);
  }

  private parseUrl(url: string): { bucket: string; key: string } {
    const parsed = new URL(url);
    if (parsed.protocol !== "s3:") throw new Error(`Expected s3:// URL, got ${parsed.protocol}`);
    const key = parsed.pathname.replace(/^\//, "");
    if (!key) throw new Error("Object URL has no key");
    return { bucket: parsed.hostname, key };
  }
}
