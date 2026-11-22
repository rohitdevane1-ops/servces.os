import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { authenticate } from '../../middleware/rbac.js';
import { successResponse, errorResponse } from '../../types/envelope.js';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_FILENAME_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/i;

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function getUploadRoot(): string {
  const configured = env.UPLOAD_STORAGE_DIR || process.env.UPLOAD_STORAGE_DIR;
  return path.resolve(configured || path.resolve(process.cwd(), 'uploads'));
}

function detectMagicMime(buf: Buffer): { mimeType: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: '.jpg' };
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mimeType: 'image/png', ext: '.png' };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', ext: '.webp' };
  }
  if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { mimeType: 'application/pdf', ext: '.pdf' };
  }
  return null;
}

function signUploadPath(tenantId: string, filename: string, exp: number): string {
  return crypto
    .createHmac('sha256', env.APP_ENCRYPTION_KEY)
    .update(`${tenantId}:${filename}:${exp}`)
    .digest('hex');
}

export async function uploadsRoutes(fastify: FastifyInstance) {
  // 1. Authenticated Multipart Media Upload (Strict MIME + Magic-Byte Check + Signed URL)
  fastify.post('/', {
    preHandler: [authenticate],
    schema: {
      tags: ['Uploads & Media'],
      summary: 'Upload image (jpg/png/webp) or pdf with magic-byte verification and receive signed URL',
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const tenantId = request.tenantId;

    let filePart: any;
    try {
      filePart = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE' || err?.statusCode === 413) {
        return reply.status(413).send(
          errorResponse('FILE_TOO_LARGE', 'Uploaded file exceeds the 5 MB limit.', requestId)
        );
      }
      return reply.status(400).send(
        errorResponse('INVALID_UPLOAD_REQUEST', err?.message || 'Multipart upload failed.', requestId)
      );
    }

    if (!filePart) {
      return reply.status(400).send(
        errorResponse('FILE_REQUIRED', 'A multipart file field is required.', requestId)
      );
    }

    let buffer: Buffer;
    try {
      buffer = await filePart.toBuffer();
      if (filePart.file?.truncated) {
        return reply.status(413).send(
          errorResponse('FILE_TOO_LARGE', 'Uploaded file exceeds the 5 MB limit.', requestId)
        );
      }
    } catch (err: any) {
      if (err?.code === 'FST_REQ_FILE_TOO_LARGE' || err?.statusCode === 413) {
        return reply.status(413).send(
          errorResponse('FILE_TOO_LARGE', 'Uploaded file exceeds the 5 MB limit.', requestId)
        );
      }
      throw err;
    }

    if (buffer.length === 0) {
      return reply.status(400).send(
        errorResponse('EMPTY_FILE', 'Uploaded file cannot be empty.', requestId)
      );
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return reply.status(413).send(
        errorResponse('FILE_TOO_LARGE', 'Uploaded file exceeds the 5 MB limit.', requestId)
      );
    }

    const detected = detectMagicMime(buffer);
    const declaredMime = String(filePart.mimetype || '').toLowerCase().trim();
    const normalizedDeclared = declaredMime === 'image/jpg' ? 'image/jpeg' : declaredMime;

    if (!detected || normalizedDeclared !== detected.mimeType) {
      return reply.status(400).send(
        errorResponse(
          'UNSUPPORTED_MEDIA_TYPE',
          'Only valid JPEG, PNG, WebP, or PDF files whose binary header matches their MIME type are accepted.',
          requestId
        )
      );
    }

    const filename = `${crypto.randomUUID()}${detected.ext}`;
    const tenantDir = path.resolve(getUploadRoot(), tenantId);
    await fs.mkdir(tenantDir, { recursive: true });
    const targetPath = path.join(tenantDir, filename);
    await fs.writeFile(targetPath, buffer);

    const ttlSeconds = env.UPLOAD_URL_TTL_SECONDS || 86400;
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = signUploadPath(tenantId, filename, exp);

    return reply.status(201).send(
      successResponse({
        url: `/api/v1/uploads/${tenantId}/${filename}?exp=${exp}&sig=${sig}`,
        filename,
        mimeType: detected.mimeType,
        sizeBytes: buffer.length,
        expiresAt: new Date(exp * 1000).toISOString(),
      }, requestId)
    );
  });

  // 2. HMAC-Signed Media Retrieval with Strict Sandbox & Sniffing Headers
  fastify.get('/:tenantId/:filename', {
    schema: {
      tags: ['Uploads & Media'],
      summary: 'Serve HMAC-signed uploaded media file safely',
    },
  }, async (request, reply) => {
    const requestId = request.id || `req_${Date.now()}`;
    const { tenantId, filename } = request.params as { tenantId: string; filename: string };
    const { exp, sig } = (request.query || {}) as { exp?: string; sig?: string };

    if (!UUID_REGEX.test(tenantId) || !SAFE_FILENAME_REGEX.test(filename)) {
      return reply.status(400).send(
        errorResponse('INVALID_MEDIA_PATH', 'Invalid upload path.', requestId)
      );
    }

    const expNum = Number(exp);
    if (!exp || !Number.isInteger(expNum) || expNum < Math.floor(Date.now() / 1000) || typeof sig !== 'string') {
      return reply.status(403).send(
        errorResponse('INVALID_OR_EXPIRED_SIGNATURE', 'Signed media URL is expired or missing signature.', requestId)
      );
    }

    const expectedSig = signUploadPath(tenantId, filename, expNum);
    const actualBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
      return reply.status(403).send(
        errorResponse('INVALID_OR_EXPIRED_SIGNATURE', 'Media URL signature verification failed.', requestId)
      );
    }

    const safeName = path.basename(filename);
    const tenantDir = path.resolve(getUploadRoot(), tenantId);
    const filePath = path.resolve(tenantDir, safeName);
    if (!filePath.startsWith(tenantDir + path.sep)) {
      return reply.status(403).send(errorResponse('FORBIDDEN', 'Invalid file path.', requestId));
    }

    let contents: Buffer;
    try {
      contents = await fs.readFile(filePath);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'Uploaded media file not found.', requestId));
      }
      throw err;
    }

    const ext = path.extname(safeName).toLowerCase();
    const mimeType = EXT_TO_MIME[ext] || 'application/octet-stream';

    reply.header('Content-Type', mimeType);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Content-Security-Policy', 'sandbox');
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.status(200).send(contents);
  });
}
