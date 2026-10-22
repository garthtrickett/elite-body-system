import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isIP } from "node:net";

export type AssessmentStorage = Readonly<{
  authorizeUpload: (input: Readonly<{ key: string; mediaType: string; size: number }>) => Promise<Readonly<{ url: string; headers: Readonly<Record<string, string>> }>>;
  finalize: (input: Readonly<{ pendingKey: string; readyKey: string; mediaType: string; size: number }>) => Promise<boolean>;
  authorizeRead: (input: Readonly<{ key: string }>) => Promise<string>;
  remove: (input: Readonly<{ key: string }>) => Promise<void>;
  listExpired: (input: Readonly<{ before: Date }>) => Promise<readonly string[]>;
}>;
export type AssessmentStorageConfig = Readonly<{ endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle?: boolean }>;

function usePathStyle(config: AssessmentStorageConfig): boolean {
  const hostname = new URL(config.endpoint).hostname.replace(/^\[|\]$/g, "");
  return config.forcePathStyle !== false || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket) || isIP(hostname) !== 0;
}

export function assessmentUploadOrigin(config: AssessmentStorageConfig): string {
  const endpoint = new URL(config.endpoint);
  if (!usePathStyle(config)) endpoint.hostname = `${config.bucket}.${endpoint.hostname}`;
  return endpoint.origin;
}

export function matchesMediaType(input: Readonly<{ bytes: Uint8Array; mediaType: string }>): boolean {
  const b = input.bytes;
  const ascii = (start: number, end: number) => Buffer.from(b.subarray(start, end)).toString("ascii");
  if (input.mediaType === "image/jpeg") return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (input.mediaType === "image/png") return Buffer.from(b.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (input.mediaType === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (input.mediaType === "video/webm") return b[0] === 26 && b[1] === 69 && b[2] === 223 && b[3] === 163;
  return ["video/mp4", "video/quicktime"].includes(input.mediaType) && ascii(4, 8) === "ftyp" && b.length >= 12;
}

export function createS3AssessmentStorage(config: AssessmentStorageConfig): AssessmentStorage {
  const client = new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: usePathStyle(config),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 2,
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  const bucket = config.bucket;
  const options = () => ({ abortSignal: AbortSignal.timeout(30000) });
  return {
    async authorizeUpload({ key, mediaType, size }) {
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mediaType, ContentLength: size }), { expiresIn: 600 });
      return { url, headers: { "Content-Type": mediaType } };
    },
    async finalize({ pendingKey, readyKey, mediaType, size }) {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: pendingKey }), options());
      if (head.ContentLength !== size || head.ContentType !== mediaType) return false;
      await client.send(new CopyObjectCommand({ Bucket: bucket, Key: readyKey, CopySource: `${bucket}/${pendingKey.split("/").map(encodeURIComponent).join("/")}`,
        CopySourceIfMatch: head.ETag, MetadataDirective: "REPLACE", ContentType: mediaType, ContentDisposition: "attachment", CacheControl: "private, no-store" }), options());
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: readyKey, Range: "bytes=0-63" }), options());
      const bytes = await result.Body?.transformToByteArray();
      if (!bytes || !matchesMediaType({ bytes, mediaType })) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: readyKey }), options()); return false; }
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: pendingKey }), options());
      return true;
    },
    authorizeRead: ({ key }) => getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: "attachment", ResponseCacheControl: "private, no-store" }), { expiresIn: 120 }),
    async remove({ key }) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), options()); },
    async listExpired({ before }) {
      const keys: string[] = [];
      let continuation: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "onboarding/", ContinuationToken: continuation, MaxKeys: 1000 }), options());
        for (const item of page.Contents ?? []) if (item.Key && item.LastModified && item.LastModified < before) keys.push(item.Key);
        continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuation);
      return keys;
    },
  };
}
