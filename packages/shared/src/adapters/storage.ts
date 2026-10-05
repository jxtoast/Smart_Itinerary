import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, envInt } from "./config";

/**
 * S3-compatible object storage (diagram: "Amazon S3 — File Storage").
 * Locally this talks to SeaweedFS (S3-compatible); on AWS leave S3_ENDPOINT unset and the same
 * code talks to real S3. Only the env vars change.
 *
 * Env: S3_ENDPOINT (optional), S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID,
 *      S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE (local S3-compatible servers: true),
 *      S3_PUBLIC_ENDPOINT (optional)
 *
 * S3_PUBLIC_ENDPOINT exists because a presigned URL embeds the host it was
 * signed for, and the browser — not this service — follows it. Under Docker
 * compose the service connects over the internal network ("http://s3:8333"),
 * which a host browser cannot resolve, so compose sets the public endpoint to
 * the published port ("http://localhost:9000"). On real S3 the endpoints are
 * naturally public: leave it unset and URLs are signed for S3 itself.
 */

export interface Storage {
  readonly bucket: string;
  putObject(key: string, body: Buffer | string, contentType: string): Promise<void>;
  presignGetUrl(key: string, expiresInSeconds?: number): Promise<string>;
}

/**
 * Resolves static S3 credentials from env. BOTH keys must be present; when
 * either is absent this returns undefined so the AWS SDK's default provider
 * chain is used instead. That chain includes the ECS task IAM role — which a
 * defaulted or half-present credentials object would silently OVERRIDE,
 * failing every call's signature. In compose mode SeaweedFS accepts any
 * pair, so the static keys are a local-only concern.
 */
export function storageCredentialsFromEnv():
  | { accessKeyId: string; secretAccessKey: string }
  | undefined {
  const accessKeyId = env("S3_ACCESS_KEY_ID");
  const secretAccessKey = env("S3_SECRET_ACCESS_KEY");
  return accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined;
}

export function createStorage(client?: S3Client, presignClient?: S3Client): Storage {
  const endpoint = env("S3_ENDPOINT");
  const publicEndpoint = env("S3_PUBLIC_ENDPOINT");
  const bucket = env("S3_BUCKET", "si-files");
  const forcePathStyle = env("S3_FORCE_PATH_STYLE", endpoint ? "true" : "false") === "true";
  const region = env("S3_REGION", "ap-southeast-1");
  const credentials = storageCredentialsFromEnv();

  const s3 =
    client ??
    new S3Client({
      region,
      ...(endpoint ? { endpoint } : {}),
      forcePathStyle,
      ...(credentials ? { credentials } : {}),
    });

  // The data path uses `s3`; URLs are signed for the browser-facing host.
  // Same credentials/region — only the host in the signature differs, and
  // The storage server validates against the Host header the browser sends.
  const presigner =
    presignClient ??
    (publicEndpoint
      ? new S3Client({ region, endpoint: publicEndpoint, forcePathStyle, ...(credentials ? { credentials } : {}) })
      : s3);

  return {
    bucket,
    async putObject(key, body, contentType) {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
      );
    },
    async presignGetUrl(key, expiresInSeconds = envInt("S3_PRESIGN_TTL_SECONDS", 3600)) {
      return getSignedUrl(
        presigner,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: expiresInSeconds }
      );
    },
  };
}
