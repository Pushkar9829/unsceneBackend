const crypto = require("crypto");
const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const env = require("../../config/env");

const assertS3Config = () => {
  if (!env.awsRegion || !env.awsS3Bucket || !env.awsAccessKeyId || !env.awsSecretAccessKey) {
    throw new Error("Missing AWS S3 configuration. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.");
  }
};

const createS3Client = () => {
  assertS3Config();
  return new S3Client({
    region: env.awsRegion,
    credentials: {
      accessKeyId: env.awsAccessKeyId,
      secretAccessKey: env.awsSecretAccessKey,
    },
  });
};

const getPublicFileUrl = (key) => {
  if (env.awsCloudFrontDomain) {
    const normalizedDomain = env.awsCloudFrontDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `https://${normalizedDomain}/${key}`;
  }

  return `https://${env.awsS3Bucket}.s3.${env.awsRegion}.amazonaws.com/${key}`;
};

const buildObjectKey = ({ folder = "uploads", fileName }) => {
  const safeFileName = String(fileName || "file").replace(/\s+/g, "_");
  return `${folder}/${Date.now()}-${crypto.randomUUID()}-${safeFileName}`;
};

const getPresignedUploadUrl = async ({
  folder = "uploads",
  fileName,
  contentType = "application/octet-stream",
  expiresInSeconds = 300,
}) => {
  const key = buildObjectKey({ folder, fileName });
  const command = new PutObjectCommand({
    Bucket: env.awsS3Bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(createS3Client(), command, {
    expiresIn: expiresInSeconds,
  });

  return {
    key,
    bucket: env.awsS3Bucket,
    region: env.awsRegion,
    uploadUrl,
    publicUrl: getPublicFileUrl(key),
  };
};

const uploadBufferToS3 = async ({
  folder = "uploads",
  fileName,
  contentType = "application/octet-stream",
  body,
}) => {
  if (!body) {
    throw new Error("Upload body is required");
  }
  const key = buildObjectKey({ folder, fileName });
  const command = new PutObjectCommand({
    Bucket: env.awsS3Bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await createS3Client().send(command);
  return {
    key,
    bucket: env.awsS3Bucket,
    region: env.awsRegion,
    publicUrl: getPublicFileUrl(key),
  };
};

/**
 * Lightweight connectivity check (does not verify object keys).
 * Returns { ok, bucket?, region?, error? } without throwing.
 */
const pingS3Bucket = async () => {
  try {
    assertS3Config();
    await createS3Client().send(
      new HeadBucketCommand({
        Bucket: env.awsS3Bucket,
      })
    );
    return { ok: true, bucket: env.awsS3Bucket, region: env.awsRegion };
  } catch (e) {
    return {
      ok: false,
      bucket: env.awsS3Bucket || null,
      region: env.awsRegion || null,
      error: e?.message || "S3 check failed",
    };
  }
};

const deleteObjectByKey = async (key) => {
  if (!key) {
    throw new Error("S3 object key is required");
  }

  const command = new DeleteObjectCommand({
    Bucket: env.awsS3Bucket,
    Key: key,
  });

  await createS3Client().send(command);
};

module.exports = {
  getPresignedUploadUrl,
  uploadBufferToS3,
  deleteObjectByKey,
  buildObjectKey,
  getPublicFileUrl,
  pingS3Bucket,
};
