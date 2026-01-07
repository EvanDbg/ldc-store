import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

type BoundingBox = { left: number; top: number; width: number; height: number };
type RawImage = { data: Uint8Array; width: number; height: number; channels: number };

const DEFAULT_INPUT_PNG = path.join("public", "Gemini_Generated_Image_jhjxb4jhjxb4jhjx.png");
const OUTPUT_SOURCE_PNG = path.join("public", "ldc-mart.png");
const OUTPUT_FAVICON_ICO = path.join("app", "favicon.ico");

const ANALYZE_SIZE = 512;
const EDGE_SCAN_THICKNESS = 6;
const PAD = 2;

const luminance = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const readRawResized = async (inputPath: string, size: number): Promise<RawImage> => {
  const { data, info } = await sharp(inputPath)
    .resize(size, size, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
};

const edgeMinLuminance = (img: RawImage, thickness: number): number => {
  const { data, width, height, channels } = img;
  if (channels < 3) throw new Error(`预期至少 3 个通道，实际为 ${channels}`);

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const t = clamp(thickness, 1, Math.min(width, height));
  let min = Number.POSITIVE_INFINITY;

  const visit = (x: number, y: number) => {
    const idx = (y * width + x) * channels;
    const r = data[idx] ?? 0;
    const g = data[idx + 1] ?? 0;
    const b = data[idx + 2] ?? 0;
    const l = luminance(r, g, b);
    if (l < min) min = l;
  };

  // 为什么要扫边缘：用户提供的图往往有“白边/留白”，边缘最能代表背景亮度
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < t; x++) visit(x, y);
    for (let x = width - t; x < width; x++) visit(x, y);
  }
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < t; y++) visit(x, y);
    for (let y = height - t; y < height; y++) visit(x, y);
  }

  return min;
};

const boundingBoxByLuminance = (img: RawImage, threshold: number): { minX: number; minY: number; maxX: number; maxY: number } | null => {
  const { data, width, height, channels } = img;
  if (channels < 3) throw new Error(`预期至少 3 个通道，实际为 ${channels}`);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;
      if (luminance(r, g, b) < threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  return { minX, minY, maxX, maxY };
};

const padAndSquare = (
  img: RawImage,
  box: { minX: number; minY: number; maxX: number; maxY: number },
  pad: number,
): { minX: number; minY: number; maxX: number; maxY: number } => {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  let minX = clamp(box.minX - pad, 0, img.width - 1);
  let minY = clamp(box.minY - pad, 0, img.height - 1);
  let maxX = clamp(box.maxX + pad, 0, img.width - 1);
  let maxY = clamp(box.maxY + pad, 0, img.height - 1);

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const size = Math.max(w, h);

  // 为什么强制正方形：favicon 是正方形资源，强制正方形能避免缩放时被拉伸/裁切不一致
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  minX = clamp(Math.floor(cx - size / 2), 0, img.width - 1);
  minY = clamp(Math.floor(cy - size / 2), 0, img.height - 1);
  maxX = clamp(minX + size - 1, 0, img.width - 1);
  maxY = clamp(minY + size - 1, 0, img.height - 1);

  // 如果因为 clamp 导致尺寸不够，再从另一侧回补
  minX = clamp(maxX - size + 1, 0, img.width - 1);
  minY = clamp(maxY - size + 1, 0, img.height - 1);

  return { minX, minY, maxX, maxY };
};

const scaleBoxToOriginal = (
  box: { minX: number; minY: number; maxX: number; maxY: number },
  original: { width: number; height: number },
  analyzed: { width: number; height: number },
): BoundingBox => {
  const scaleX = original.width / analyzed.width;
  const scaleY = original.height / analyzed.height;

  const left = Math.max(0, Math.round(box.minX * scaleX));
  const top = Math.max(0, Math.round(box.minY * scaleY));
  const width = Math.min(original.width - left, Math.round((box.maxX - box.minX + 1) * scaleX));
  const height = Math.min(original.height - top, Math.round((box.maxY - box.minY + 1) * scaleY));

  return { left, top, width, height };
};

const buildIco = (images: Array<{ size: number; png: Buffer }>): Buffer => {
  if (images.length === 0) throw new Error("没有可写入 ICO 的图片");

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4); // count

  const entries: Buffer[] = [];
  const payloads: Buffer[] = [];

  let offset = header.length + images.length * 16;

  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count（对 PNG 内嵌不严格，但这么写兼容性更好）
    entry.writeUInt32LE(png.length, 8); // bytes in res
    entry.writeUInt32LE(offset, 12); // image offset

    entries.push(entry);
    payloads.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...payloads]);
};

const parseArgs = (argv: string[]): { inputPath: string | null; noCrop: boolean } => {
  const noCrop = argv.includes("--no-crop");
  const inputPath = argv.find((arg) => !arg.startsWith("--")) ?? null;
  return { inputPath, noCrop };
};

const firstExistingPath = async (candidates: string[]): Promise<string | null> => {
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await fs
      .access(candidate)
      .then(() => true)
      .catch(() => false);
    if (ok) return candidate;
  }
  return null;
};

const main = async (): Promise<void> => {
  const { inputPath: inputArg, noCrop } = parseArgs(process.argv.slice(2));
  const inputPath =
    inputArg ??
    (await firstExistingPath([
      DEFAULT_INPUT_PNG,
      // 如果用户把原始大图删了，仍可用已裁切/压缩后的 ldc-mart.png 重新生成 favicon
      OUTPUT_SOURCE_PNG,
    ]));

  if (!inputPath) {
    throw new Error(`找不到输入图片：${DEFAULT_INPUT_PNG} 或 ${OUTPUT_SOURCE_PNG}`);
  }

  const originalMeta = await sharp(inputPath).metadata();
  if (!originalMeta.width || !originalMeta.height) {
    throw new Error("无法读取输入图片尺寸");
  }
  if (originalMeta.width !== originalMeta.height) {
    throw new Error(`输入图片不是正方形（${originalMeta.width}x${originalMeta.height}），当前脚本按正方形 favicon 处理`);
  }

  const shouldCrop = !noCrop && inputPath !== OUTPUT_SOURCE_PNG;

  let analyzed: { size: number; threshold: number | null; minEdge: number | null } = {
    size: ANALYZE_SIZE,
    threshold: null,
    minEdge: null,
  };
  let crop: BoundingBox = { left: 0, top: 0, width: originalMeta.width, height: originalMeta.height };

  if (shouldCrop) {
    const analyzedRaw = await readRawResized(inputPath, ANALYZE_SIZE);
    const minEdge = edgeMinLuminance(analyzedRaw, EDGE_SCAN_THICKNESS);
    const baseThreshold = Math.max(0, Math.floor(minEdge) - 1);

    let found: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
    let usedThreshold = baseThreshold;

    // 为什么做阈值回退：不同导出/压缩方式会让边缘背景亮度波动，回退能避免“裁切不到内容”
    for (let i = 0; i <= 24; i++) {
      const thr = baseThreshold + i;
      const box = boundingBoxByLuminance(analyzedRaw, thr);
      if (!box) continue;

      const w = box.maxX - box.minX + 1;
      const h = box.maxY - box.minY + 1;
      const full = w > analyzedRaw.width * 0.98 || h > analyzedRaw.height * 0.98;
      const tiny = w < analyzedRaw.width * 0.3 || h < analyzedRaw.height * 0.3;
      if (full || tiny) continue;

      found = box;
      usedThreshold = thr;
      break;
    }

    if (!found) {
      throw new Error(`裁切失败：无法在阈值 ${baseThreshold}~${baseThreshold + 24} 内定位主体区域`);
    }

    const squared = padAndSquare(analyzedRaw, found, PAD);
    crop = scaleBoxToOriginal(
      squared,
      { width: originalMeta.width, height: originalMeta.height },
      { width: analyzedRaw.width, height: analyzedRaw.height },
    );

    analyzed = { size: analyzedRaw.width, threshold: usedThreshold, minEdge: Number(minEdge.toFixed(2)) };
  }

  // 为什么强制 RGBA：Next.js（Turbopack）在解析 favicon.ico 内嵌 PNG 时要求 RGBA，否则会报 “The PNG is not in RGBA format”
  const base = sharp(inputPath).extract(crop).ensureAlpha();

  // sharp 不允许 input/output 同路径，使用临时文件再原子替换
  const sourcePngTempPath = inputPath === OUTPUT_SOURCE_PNG ? `${OUTPUT_SOURCE_PNG}.tmp` : OUTPUT_SOURCE_PNG;
  await base
    .clone()
    .removeAlpha()
    .resize(1024, 1024, { fit: "fill" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(sourcePngTempPath);

  if (sourcePngTempPath !== OUTPUT_SOURCE_PNG) {
    await fs.rename(sourcePngTempPath, OUTPUT_SOURCE_PNG);
  }

  // favicon 主要用在浏览器标签/书签，小尺寸为主；做太多大尺寸会显著增大 favicon.ico 体积
  const sizes = [16, 32, 48, 64] as const;
  const pngs = await Promise.all(
    sizes.map((size) =>
      base
        .clone()
        .resize(size, size, { fit: "fill" })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toBuffer(),
    ),
  );

  const ico = buildIco(sizes.map((size, i) => ({ size, png: pngs[i] })));
  await fs.writeFile(OUTPUT_FAVICON_ICO, ico);

  console.log(
    JSON.stringify(
      { input: inputPath, analyzed, crop, outputs: [OUTPUT_SOURCE_PNG, OUTPUT_FAVICON_ICO] },
      null,
      2,
    ),
  );
};

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
