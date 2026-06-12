type PdfParseTextResult = {
  text: string;
  totalPages: number;
};

type PdfCanvasModule = {
  DOMMatrix?: unknown;
  ImageData?: unknown;
  Path2D?: unknown;
};

type PdfParseConstructor = typeof import("pdf-parse").PDFParse & {
  setWorker?: (workerSrc?: string) => string;
};

type Matrix2D = [number, number, number, number, number, number];

export async function extractPdfTextWithPdfParse(buffer: Buffer): Promise<PdfParseTextResult> {
  const { createRequire } = await import("module");
  const require = createRequire(import.meta.url);
  installPdfParseNodePolyfills(require);

  const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");
  configurePdfParseWorker(require, PDFParse as PdfParseConstructor);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return {
      text: result.text ?? "",
      totalPages: result.total,
    };
  } finally {
    await parser.destroy();
  }
}

function installPdfParseNodePolyfills(require: NodeRequire) {
  const target = globalThis as Record<string, unknown>;
  if (target.DOMMatrix && target.ImageData && target.Path2D) return;

  let canvas: PdfCanvasModule | null = null;
  if (process.env.WIREGENE_PDF_FORCE_JS_POLYFILLS !== "true") {
    try {
      canvas = require("@napi-rs/canvas") as PdfCanvasModule;
    } catch {
      canvas = null;
    }
  }

  target.DOMMatrix ??= canvas?.DOMMatrix ?? PdfDomMatrixFallback;
  target.ImageData ??= canvas?.ImageData ?? PdfImageDataFallback;
  target.Path2D ??= canvas?.Path2D ?? PdfPath2DFallback;
}

function configurePdfParseWorker(require: NodeRequire, PDFParse: PdfParseConstructor) {
  if (process.env.WIREGENE_PDF_DISABLE_WORKER_CONFIG === "true") return;
  if (typeof PDFParse.setWorker !== "function") return;

  const workerUrl = resolvePdfParseWorkerUrl(require);
  if (workerUrl) {
    PDFParse.setWorker(workerUrl);
  }
}

function resolvePdfParseWorkerUrl(require: NodeRequire) {
  try {
    const path = require("node:path") as typeof import("node:path");
    const { pathToFileURL } = require("node:url") as typeof import("node:url");
    const mainPath = require.resolve("pdf-parse");
    const workerPath = path.join(path.dirname(mainPath), "pdf.worker.mjs");
    return pathToFileURL(workerPath).toString();
  } catch {
    return null;
  }
}

class PdfDomMatrixFallback {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  is2D = true;

  constructor(init?: string | number[] | Record<string, unknown>) {
    if (typeof init === "string" && init.trim()) {
      this.setMatrix(parseMatrixString(init));
      return;
    }
    if (Array.isArray(init)) {
      this.setMatrix(matrixFromArray(init));
      return;
    }
    if (init && typeof init === "object") {
      this.setMatrix(matrixFromObject(init));
    }
  }

  get m11() {
    return this.a;
  }

  set m11(value: number) {
    this.a = value;
  }

  get m12() {
    return this.b;
  }

  set m12(value: number) {
    this.b = value;
  }

  get m21() {
    return this.c;
  }

  set m21(value: number) {
    this.c = value;
  }

  get m22() {
    return this.d;
  }

  set m22(value: number) {
    this.d = value;
  }

  get m41() {
    return this.e;
  }

  set m41(value: number) {
    this.e = value;
  }

  get m42() {
    return this.f;
  }

  set m42(value: number) {
    this.f = value;
  }

  get isIdentity() {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
  }

  static fromFloat32Array(array32: Float32Array) {
    return new PdfDomMatrixFallback(Array.from(array32));
  }

  static fromFloat64Array(array64: Float64Array) {
    return new PdfDomMatrixFallback(Array.from(array64));
  }

  static fromMatrix(other?: Record<string, unknown>) {
    return new PdfDomMatrixFallback(other);
  }

  multiply(other?: Record<string, unknown>) {
    return new PdfDomMatrixFallback(this.toMatrix()).multiplySelf(other);
  }

  multiplySelf(other?: Record<string, unknown>) {
    this.setMatrix(multiplyMatrices(this.toMatrix(), matrixFromObject(other ?? {})));
    return this;
  }

  preMultiplySelf(other?: Record<string, unknown>) {
    this.setMatrix(multiplyMatrices(matrixFromObject(other ?? {}), this.toMatrix()));
    return this;
  }

  translate(tx = 0, ty = 0) {
    return new PdfDomMatrixFallback(this.toMatrix()).translateSelf(tx, ty);
  }

  translateSelf(tx = 0, ty = 0) {
    return this.multiplySelf({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
  }

  scale(scaleX = 1, scaleY = scaleX) {
    return new PdfDomMatrixFallback(this.toMatrix()).scaleSelf(scaleX, scaleY);
  }

  scaleSelf(scaleX = 1, scaleY = scaleX) {
    return this.multiplySelf({ a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 });
  }

  invertSelf() {
    const determinant = this.a * this.d - this.b * this.c;
    if (determinant === 0) {
      this.a = Number.NaN;
      this.b = Number.NaN;
      this.c = Number.NaN;
      this.d = Number.NaN;
      this.e = Number.NaN;
      this.f = Number.NaN;
      return this;
    }
    this.setMatrix([
      this.d / determinant,
      -this.b / determinant,
      -this.c / determinant,
      this.a / determinant,
      (this.c * this.f - this.d * this.e) / determinant,
      (this.b * this.e - this.a * this.f) / determinant,
    ]);
    return this;
  }

  transformPoint(point: { x?: number; y?: number } = {}) {
    const x = point.x ?? 0;
    const y = point.y ?? 0;
    return {
      x: x * this.a + y * this.c + this.e,
      y: x * this.b + y * this.d + this.f,
    };
  }

  toFloat32Array() {
    return new Float32Array(this.toArray16());
  }

  toFloat64Array() {
    return new Float64Array(this.toArray16());
  }

  toString() {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }

  toJSON() {
    return this.toArray16();
  }

  private toMatrix(): Matrix2D {
    return [this.a, this.b, this.c, this.d, this.e, this.f];
  }

  private toArray16() {
    return [this.a, this.b, 0, 0, this.c, this.d, 0, 0, 0, 0, 1, 0, this.e, this.f, 0, 1];
  }

  private setMatrix(matrix: Matrix2D) {
    [this.a, this.b, this.c, this.d, this.e, this.f] = matrix;
  }
}

class PdfImageDataFallback {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace = "srgb";

  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
    if (typeof dataOrWidth === "number") {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
      return;
    }
    this.data = dataOrWidth;
    this.width = widthOrHeight;
    this.height = height ?? Math.floor(this.data.length / 4 / this.width);
  }
}

class PdfPath2DFallback {
  constructor(...args: unknown[]) {
    void args;
  }
  addPath(...args: unknown[]) {
    void args;
  }
  closePath() {}
  moveTo(...args: unknown[]) {
    void args;
  }
  lineTo(...args: unknown[]) {
    void args;
  }
  bezierCurveTo(...args: unknown[]) {
    void args;
  }
  quadraticCurveTo(...args: unknown[]) {
    void args;
  }
  rect(...args: unknown[]) {
    void args;
  }
  roundRect(...args: unknown[]) {
    void args;
  }
  arc(...args: unknown[]) {
    void args;
  }
  arcTo(...args: unknown[]) {
    void args;
  }
  ellipse(...args: unknown[]) {
    void args;
  }
}

function parseMatrixString(value: string): Matrix2D {
  const numbers = value.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
  return matrixFromArray(numbers);
}

function matrixFromArray(values: number[]): Matrix2D {
  if (values.length >= 16) return [values[0], values[1], values[4], values[5], values[12], values[13]];
  if (values.length >= 6) return [values[0], values[1], values[2], values[3], values[4], values[5]];
  return [1, 0, 0, 1, 0, 0];
}

function matrixFromObject(value: Record<string, unknown>): Matrix2D {
  return [
    numberValue(value.a ?? value.m11, 1),
    numberValue(value.b ?? value.m12, 0),
    numberValue(value.c ?? value.m21, 0),
    numberValue(value.d ?? value.m22, 1),
    numberValue(value.e ?? value.m41, 0),
    numberValue(value.f ?? value.m42, 0),
  ];
}

function multiplyMatrices(left: Matrix2D, right: Matrix2D): Matrix2D {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
