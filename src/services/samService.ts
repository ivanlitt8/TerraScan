/**
 * Servicio de segmentación de lotes con **SlimSAM** ejecutado 100 % en el
 * navegador a través de `@huggingface/transformers` (Transformers.js).
 *
 * Modelo: `Xenova/slimsam-77-uniform` (~ 40 MB, descarga única; el navegador
 * lo cachea en IndexedDB tras el primer load).
 *
 * Flujo end-to-end:
 *
 *   drag(map) → predictMask(canvas, { bbox } | { click } | { click, bbox })
 *     1. Copia del WebGL canvas a un canvas 2D auxiliar (`drawImage`)
 *     2. `RawImage.fromCanvas(aux)` → bitmap RGBA usable por el processor
 *     3. `processor(image, { input_points|input_labels|input_boxes })`
 *     4. `model(inputs)` (encoder TinyViT + decoder prompted en un paso)
 *     5. `processor.post_process_masks(...)` (upscale a tamaño original)
 *     6. Selección de la máscara con mayor `iou_score`
 *     7. Devuelve `Uint8Array` binaria + `pixelScale` (CSS ↔ físicos)
 *
 * Bounding box vs. click: el `bbox` produce siluetas mucho más completas y
 * rectas para lotes rurales (SAM "sabe" que el objeto cabe dentro de ese
 * rectángulo). El `click` solo se mantiene como modo legacy/fallback.
 *
 * Importante:
 *  - El consumidor (hook) recibe la máscara en coordenadas **del canvas físico**
 *    y debe dividir por `pixelScale` antes de hacer `map.unproject([x, y])`
 *    (MapLibre opera en CSS pixels).
 *  - Tensors de entrada/salida se liberan explícitamente con `dispose()` para
 *    evitar fugas de memoria GPU en sesiones largas.
 */

import {
  AutoProcessor,
  RawImage,
  SamModel,
  env as transformersEnv,
  type Processor,
  type Tensor,
} from "@huggingface/transformers";

const MODEL_ID = "Xenova/slimsam-77-uniform";

/** Backends de ejecución soportados por Transformers.js, ordenados por prioridad. */
export type SamExecutionProvider = "webgpu" | "webgl" | "wasm";

export type SamLoadStatus =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; provider: SamExecutionProvider }
  | { phase: "error"; message: string };

export type ClickCoords = {
  /** Coordenada X en CSS pixels del canvas, origen arriba-izquierda. */
  x: number;
  /** Coordenada Y en CSS pixels del canvas, origen arriba-izquierda. */
  y: number;
};

/**
 * Bounding box en CSS pixels del canvas: `[x1, y1, x2, y2]` con origen
 * arriba-izquierda. SAM se beneficia mucho de tener un bbox como prompt:
 * en lotes rurales devuelve siluetas mucho más rectas y completas que con
 * un único punto positivo (que tiende a quedarse en la mancha de
 * vegetación interna).
 */
export type BBoxCoords = [number, number, number, number];

export type SamPredictOptions = {
  /** Punto positivo (foreground). Opcional si se provee `bbox`. */
  click?: ClickCoords;
  /** Bounding box `[x1, y1, x2, y2]` en CSS pixels. Opcional si se provee `click`. */
  bbox?: BBoxCoords;
};

/**
 * Resultado de `predictMask`.
 *
 * `mask` es un buffer plano `Uint8Array` de `width × height` bytes con
 * valores `0` (fuera) / `1` (dentro). Las dimensiones están en **píxeles
 * físicos del canvas** (no en CSS pixels); usar `pixelScale` para convertir.
 */
export type SamMaskResult = {
  mask: Uint8Array;
  width: number;
  height: number;
  /**
   * Factor `physicalPx / cssPx`. Para `map.unproject([cssX, cssY])` el
   * consumidor debe hacer `cssX = maskPx.x / pixelScale`.
   */
  pixelScale: number;
  /** `iou_scores` de la máscara seleccionada (0–1, más alto = mejor). */
  score: number;
  /** Backend que el runtime ONNX usó efectivamente para inferir. */
  provider: SamExecutionProvider;
};

export class SamServiceError extends Error {
  readonly code:
    | "not-ready"
    | "model-missing"
    | "inference-failed"
    | "unsupported";

  constructor(message: string, code: SamServiceError["code"]) {
    super(message);
    this.name = "SamServiceError";
    this.code = code;
  }
}

/**
 * Detecta el mejor backend disponible para `@huggingface/transformers`.
 *
 * - WebGPU: Chromium ≥ 113, Edge, Safari TP. El más rápido por amplio margen
 *   para el encoder de TinyViT (~ 8× vs WASM SIMD-multi-thread).
 * - WebGL: ya no es backend oficial de Transformers.js v3 (lo retiraron
 *   porque varios operadores fallaban). Lo dejamos como diagnóstico pero
 *   el runtime termina cayendo a WASM si elegimos `webgl`.
 * - WASM: fallback universal con SIMD + multi-thread.
 */
function detectBestProvider(): SamExecutionProvider {
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    return "webgpu";
  }
  return "wasm";
}

type SamProcessorInputs = {
  pixel_values: Tensor;
  original_sizes: [number, number][];
  reshaped_input_sizes: [number, number][];
  input_points?: Tensor;
  input_labels?: Tensor;
  input_boxes?: Tensor;
};

type SamProcessor = Processor & {
  (
    image: RawImage,
    options?: {
      input_points?: number[][][];
      input_labels?: number[][];
      input_boxes?: number[][][];
    },
  ): Promise<SamProcessorInputs>;
  post_process_masks: (
    masks: Tensor,
    originalSizes: [number, number][],
    reshapedInputSizes: [number, number][],
  ) => Promise<Tensor[]>;
};

type SamModelOutput = {
  pred_masks: Tensor;
  iou_scores: Tensor;
};

class SamService {
  private model: SamModel | null = null;
  private processor: SamProcessor | null = null;
  private loadingPromise: Promise<void> | null = null;
  private status: SamLoadStatus = { phase: "idle" };

  /**
   * Carga (perezosa, idempotente) el procesador + modelo SlimSAM desde el Hub.
   * Si se llama mientras hay una descarga en curso, devuelve la **misma**
   * promise para no bajar el modelo dos veces.
   */
  async loadModels(): Promise<void> {
    if (this.status.phase === "ready") return;
    if (this.loadingPromise) return this.loadingPromise;

    this.status = { phase: "loading" };
    this.loadingPromise = this.doLoad();

    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async doLoad(): Promise<void> {
    const provider = detectBestProvider();

    // `allowLocalModels: false` evita un fetch a `/models/...` antes de ir al
    // Hub (somos web puro, no servimos modelos local-first).
    transformersEnv.allowLocalModels = false;
    transformersEnv.useBrowserCache = true;

    console.info("[samService] cargando SlimSAM…", {
      modelId: MODEL_ID,
      provider,
    });

    try {
      const [processor, model] = await Promise.all([
        AutoProcessor.from_pretrained(MODEL_ID),
        SamModel.from_pretrained(MODEL_ID, {
          // `fp16` reduce la huella de memoria a la mitad. Si el navegador no
          // soporta float16 en WebGPU, Transformers.js cae a `fp32` solo.
          dtype: "fp16",
          device: provider === "webgpu" ? "webgpu" : "wasm",
        }),
      ]);

      this.processor = processor as SamProcessor;
      this.model = model as SamModel;
      this.status = { phase: "ready", provider };

      console.info("[samService] SlimSAM listo", { provider });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : String(cause);
      console.error("[samService] ✕ loadModels", cause);
      this.status = { phase: "error", message };
      throw new SamServiceError(
        `No pudimos descargar el modelo de IA: ${message}`,
        "model-missing",
      );
    }
  }

  /**
   * Predice la máscara binaria de un lote a partir de un prompt geométrico
   * (un punto positivo, un bounding box, o ambos a la vez).
   *
   * Si los modelos no están cargados, espera a que carguen. Si el navegador no
   * soporta los backends necesarios, propaga `SamServiceError`.
   */
  async predictMask(
    mapCanvas: HTMLCanvasElement,
    options: SamPredictOptions,
  ): Promise<SamMaskResult> {
    if (!options.click && !options.bbox) {
      throw new SamServiceError(
        "Necesitamos al menos un `click` o un `bbox` para inferir la máscara.",
        "inference-failed",
      );
    }

    if (this.status.phase === "idle") {
      await this.loadModels();
    }

    if (this.status.phase !== "ready" || !this.processor || !this.model) {
      throw new SamServiceError(
        "Los modelos SlimSAM no terminaron de cargar todavía.",
        "not-ready",
      );
    }

    const provider = this.status.provider;
    const pixelScale =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    // Los prompts llegan en CSS pixels (los que ve el usuario en pantalla);
    // el bitmap que vamos a procesar es físico (`canvas.width × canvas.height`
    // multiplicado por `dpr`). Convertimos antes de pasárselos al processor.
    let inputPoints: number[][][] | undefined;
    let inputLabels: number[][] | undefined;
    let inputBoxes: number[][][] | undefined;

    if (options.click) {
      // 3D shape: `[point_batch_size, nb_points_per_image, 2]`. 1 punto fg.
      inputPoints = [
        [[options.click.x * pixelScale, options.click.y * pixelScale]],
      ];
      // 2D shape: `[point_batch_size, nb_points_per_image]`. Label 1 = fg.
      inputLabels = [[1]];
    }

    if (options.bbox) {
      const [x1, y1, x2, y2] = options.bbox;
      if (!inputPoints) {
        // Transformers.js procesa `input_boxes`, pero el wrapper de `SamModel`
        // (SAM v1 / SlimSAM) todavía asume internamente que existe
        // `input_points` y lee `input_points.dims`. Box-only termina en:
        //   Cannot read properties of undefined (reading 'dims')
        // Para evitarlo, acompañamos el bbox con un punto foreground en su
        // centro. Esto además ayuda al decoder a elegir el lote dentro del
        // rectángulo cuando hay caminos/vegetación cerca de los bordes.
        inputPoints = [
          [
            [
              ((x1 + x2) / 2) * pixelScale,
              ((y1 + y2) / 2) * pixelScale,
            ],
          ],
        ];
        inputLabels = [[1]];
      }

      // 3D shape: `[batch_size, num_boxes, 4]`. Coordenadas en pixel-space de
      // la imagen original (no del modelo). El processor reescala al espacio
      // interno (1024×1024 padded) internamente.
      inputBoxes = [
        [
          [
            x1 * pixelScale,
            y1 * pixelScale,
            x2 * pixelScale,
            y2 * pixelScale,
          ],
        ],
      ];
    }

    let processorInputs: SamProcessorInputs | null = null;
    let outputs: SamModelOutput | null = null;
    let postProcessedMasks: Tensor[] | null = null;

    try {
      // El canvas de MapLibre vive con un contexto WebGL2 desde su creación,
      // y la regla "un solo contexto por canvas" del estándar HTML hace que
      // `mapCanvas.getContext("2d")` devuelva `null` para siempre. Como
      // `RawImage.fromCanvas` internamente hace `getContext("2d").getImageData()`,
      // si le pasamos directamente el canvas WebGL tira:
      //   "Cannot read properties of null (reading 'getImageData')"
      // Solución: copiamos el contenido a un canvas 2D auxiliar y leemos de ahí.
      // `drawImage(webglCanvas)` funciona porque MapLibre ya está configurado con
      // `preserveDrawingBuffer: true` (sin eso copiaríamos un frame en negro).
      const image = await rawImageFromWebglCanvas(mapCanvas);
      const resolvedInputs = await this.processor(image, {
        ...(inputPoints && {
          input_points: inputPoints,
          input_labels: inputLabels,
        }),
        ...(inputBoxes && { input_boxes: inputBoxes }),
      });
      processorInputs = resolvedInputs;

      outputs = (await this.model(resolvedInputs)) as SamModelOutput;

      postProcessedMasks = await this.processor.post_process_masks(
        outputs.pred_masks,
        resolvedInputs.original_sizes,
        resolvedInputs.reshaped_input_sizes,
      );

      const maskTensor = postProcessedMasks[0];
      if (!maskTensor) {
        throw new SamServiceError(
          "El modelo devolvió un tensor de máscara vacío.",
          "inference-failed",
        );
      }

      const dims = maskTensor.dims;
      // dims esperados: `[1, num_masks, H, W]` (4D). SlimSAM emite 3
      // candidatas por click; nos quedamos con la de mayor `iou_score`.
      if (dims.length !== 4) {
        throw new SamServiceError(
          `Forma inesperada del tensor de máscara: [${dims.join(", ")}].`,
          "inference-failed",
        );
      }

      const numMasks = dims[1];
      const height = dims[2];
      const width = dims[3];
      const stride = height * width;

      const scoresData = outputs.iou_scores.data as
        | Float32Array
        | Float64Array;
      let bestIdx = 0;
      for (let i = 1; i < numMasks; i += 1) {
        if (Number(scoresData[i]) > Number(scoresData[bestIdx])) bestIdx = i;
      }
      const bestScore = Number(scoresData[bestIdx]);

      const maskData = maskTensor.data as Uint8Array;
      const offset = bestIdx * stride;
      const mask = new Uint8Array(stride);
      for (let i = 0; i < stride; i += 1) {
        mask[i] = maskData[offset + i] ? 1 : 0;
      }

      return {
        mask,
        width,
        height,
        pixelScale,
        score: bestScore,
        provider,
      };
    } catch (cause) {
      if (cause instanceof SamServiceError) throw cause;
      const message =
        cause instanceof Error ? cause.message : String(cause);
      console.error("[samService] ✕ predictMask", cause);
      throw new SamServiceError(
        `Falló la inferencia: ${message}`,
        "inference-failed",
      );
    } finally {
      // Liberamos todos los tensores explícitamente. `Transformers.js` no los
      // GC-ea solo (corren sobre ONNX Runtime + WebGPU/WASM con buffers
      // nativos), así que sin `dispose` la memoria GPU crece con cada click.
      safeDispose(outputs?.pred_masks);
      safeDispose(outputs?.iou_scores);
      safeDispose(processorInputs?.pixel_values);
      safeDispose(processorInputs?.input_points);
      safeDispose(processorInputs?.input_labels);
      safeDispose(processorInputs?.input_boxes);
      if (postProcessedMasks) {
        for (const m of postProcessedMasks) safeDispose(m);
      }
    }
  }

  /** Estado actual de carga; útil para spinner/badge desde la UI. */
  getStatus(): SamLoadStatus {
    return this.status;
  }
}

function safeDispose(tensor: Tensor | undefined): void {
  if (!tensor) return;
  try {
    tensor.dispose();
  } catch {
    // Algunos tensores ya están disposed (p. ej. los inputs que el modelo
    // consumió). Ignoramos silenciosamente para no contaminar logs.
  }
}

/**
 * Copia el contenido de un canvas WebGL a un canvas 2D auxiliar y arma una
 * `RawImage` desde ese intermedio.
 *
 * Necesario porque:
 *  - El canvas de MapLibre tiene un contexto WebGL2 vitalicio (regla "un solo
 *    contexto por canvas" del estándar HTML).
 *  - `RawImage.fromCanvas` requiere un contexto 2D para llamar a `getImageData`.
 *
 * Costo: una copia memoria→memoria del bitmap (típicamente 4–8 MB para un
 * canvas de 1500–2000 px). Trivial comparado con la inferencia (cientos de ms).
 *
 * Requisitos previos en el llamador:
 *  - El `maplibregl.Map` debe haberse creado con
 *    `canvasContextAttributes: { preserveDrawingBuffer: true }`, si no
 *    `drawImage(webglCanvas)` copia un frame ya vaciado (canvas negro).
 */
async function rawImageFromWebglCanvas(
  source: HTMLCanvasElement,
): Promise<RawImage> {
  const width = source.width;
  const height = source.height;

  if (!width || !height) {
    throw new SamServiceError(
      "El canvas del mapa todavía no tiene dimensiones; esperá a que termine de renderizar.",
      "inference-failed",
    );
  }

  // `OffscreenCanvas` cuando está disponible (Chromium, Firefox 105+, Safari
  // 16.4+); es marginalmente más rápido y no afecta el DOM. Fallback a un
  // `<canvas>` desconectado, que también funciona en cualquier navegador
  // moderno (no se inserta nunca en `document`).
  const aux: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : (() => {
          const el = document.createElement("canvas");
          el.width = width;
          el.height = height;
          return el;
        })();

  const ctx = aux.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) {
    throw new SamServiceError(
      "No pudimos crear un contexto 2D para leer la imagen del mapa.",
      "unsupported",
    );
  }

  // Importante: `drawImage` copia el bitmap respetando el origen top-left de
  // imágenes (no el bottom-left de WebGL), por lo que no hace falta invertir
  // el eje Y. Y respeta también el alpha pre-multiplicado.
  ctx.drawImage(source, 0, 0);

  // `RawImage.fromCanvas` ahora encuentra un contexto 2D válido y extrae los
  // RGBA con `getImageData` sin tocar el canvas WebGL original.
  return RawImage.fromCanvas(aux);
}

/**
 * Instancia única del servicio. Mantener una sola sesión por pestaña evita
 * descargar 40 MB dos veces y no duplica los buffers GPU del encoder.
 */
export const samService = new SamService();
