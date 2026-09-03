import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, envInt } from "./config";

/**
 * S3-compatible object storage (diagram: "Amazon S3 — File Storage").
 * Locally this talks to MinIO; on AWS leave S3_ENDPOINT unset and the same
 * code talks to real S3. Only the env vars change.
 *
 * Env: S3_ENDPOINT (optional), S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID,
 *      S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE (MinIO: true)
 */

export interface Storage {
  readonly bucket: string;
  putObject(key: string, body: Buffer | string, contentType: string): Promise<void>;
  presignGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

export function createStorage(client?: S3Client): Storage {
  const endpoint = env("S3_ENDPOINT");
  const bucket = env("S3_BUCKET", "si-files");
  const forcePathStyle = env("S3_FORCE_PATH_STYLE", endpoint ? "true" : "false") === "true";

  const s3 =
    client ??
    new S3Client({
      region: env("S3_REGION", "ap-southeast-1"),
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle,
      credentials: {
        accessKeyId: env("S3_ACCESS_KEY_ID", "smart"),
        secretAccessKey: env("S3_SECRET_ACCESS_KEY", "smart-local-dev"),
      },
    });

  return {
    bucket,
    async putObject(key, body, contentType) {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
      );
    },
    async presignGetUrl(key, expiresInSeconds = envInt("S3_PRESIGN_TTL_SECONDS", 3600)) {
      return getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: expiresInSeconds }
      );
    },
  };
}
