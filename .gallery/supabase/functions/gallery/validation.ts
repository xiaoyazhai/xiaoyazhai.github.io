export const MAX_UPLOAD = 6 * 1024 * 1024;
export const MAX_THUMB = 512 * 1024;

export class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function inputText(value: unknown, max: number, required = false): string {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new RequestError(400, '请检查填写内容。');
  const result = value.trim();
  if ((required && !result) || [...result].length > max || result.includes('\0')) {
    throw new RequestError(400, '有必填内容为空或超过长度限制。');
  }
  return result;
}

export function inputPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    throw new RequestError(400, '请填写有效的口令。');
  }
  return value;
}

export function inputUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new RequestError(400, '无效的作品或分类标识。');
  }
  return value;
}

export function inputUrl(value: unknown): string {
  const text = inputText(value, 512);
  if (!text) return text;
  try {
    const url = new URL(text);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.href.length <= 512) {
      return url.href;
    }
  } catch {
    // Report the same validation message for malformed URLs.
  }
  throw new RequestError(400, '来源链接须为 HTTP 或 HTTPS 地址。');
}

export function inputYear(value: unknown): number | null {
  const text = inputText(value, 4);
  if (!text) return null;
  const year = Number(text);
  if (!Number.isInteger(year) || year < 1500 || year > 2200) {
    throw new RequestError(400, '请填写四位出版年份。');
  }
  return year;
}

export async function readImage(file: FormDataEntryValue | null, max: number) {
  if (!(file instanceof File) || !file.size || file.size > max) {
    throw new RequestError(400, '请选择符合大小限制的 JPG、PNG 或 WebP 图片。');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const starts = (...signature: number[]) => signature.every((part, index) => bytes[index] === part);
  const ascii = (offset: number, text: string) =>
    [...text].every((part, index) => bytes[offset + index] === part.charCodeAt(0));
  if (starts(255, 216, 255) && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
    return { bytes, mime: 'image/jpeg', extension: 'jpg' };
  }
  if (bytes.length >= 45 && starts(137, 80, 78, 71, 13, 10, 26, 10) &&
      ascii(12, 'IHDR') && ascii(bytes.length - 8, 'IEND')) {
    return { bytes, mime: 'image/png', extension: 'png' };
  }
  if (bytes.length >= 20 && ascii(0, 'RIFF') && ascii(8, 'WEBP') &&
      (ascii(12, 'VP8 ') || ascii(12, 'VP8L') || ascii(12, 'VP8X')) &&
      new DataView(bytes.buffer).getUint32(4, true) === bytes.length - 8) {
    return { bytes, mime: 'image/webp', extension: 'webp' };
  }
  throw new RequestError(400, '图片文件格式未通过校验。');
}

export async function digest(secret: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function matchesPassword(supplied: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(supplied), digest(expected)]);
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return expected.length > 0 && mismatch === 0;
}

export function mintToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function isToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export async function boundedBody(req: Request, limit: number) {
  if (Number(req.headers.get('content-length')) > limit) throw new RequestError(413, '请求内容过大。');
  let size = 0;
  const body = req.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > limit) throw new RequestError(413, '请求内容过大。');
      controller.enqueue(chunk);
    },
  }));
  return new Response(body, { headers: { 'content-type': req.headers.get('content-type') ?? '' } });
}
