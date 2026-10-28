const {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

const accountId = process.env.R2_ACCOUNT_ID || '';
const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
const bucket = process.env.R2_BUCKET || '';
const endpoint =
  process.env.R2_ENDPOINT ||
  (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
const region = process.env.R2_REGION || 'auto';

if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
  console.error('Faltan variables: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET o R2_ENDPOINT.');
  process.exit(1);
}

if (accessKeyId === secretAccessKey) {
  console.warn(
    'Aviso: R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY tienen el mismo valor. Deberían ser credenciales distintas.',
  );
}

const client = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
});

const key = `__healthcheck/${Date.now()}.txt`;

async function main() {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`R2 OK: bucket "${bucket}" accesible.`);

  if (process.env.R2_CHECK_WRITE === '1') {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: Buffer.from('r2 healthcheck'),
        ContentType: 'text/plain',
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    console.log('R2 WRITE OK: objeto de prueba creado y eliminado.');
  }
}

main().catch((error) => {
  console.error(`R2 ERROR: ${error.name || 'Error'}: ${error.message || error}`);
  process.exitCode = 1;
});
