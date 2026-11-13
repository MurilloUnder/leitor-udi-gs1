import { prepareZXingModule, readBarcodes, type ReaderOptions, type ZXingModuleOverrides } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

const OPCOES: ReaderOptions = {
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  formats: ["DataMatrix", "QRCode", "Code128", "DataBar", "DataBarExpanded"],
  maxNumberOfSymbols: 1,
  textMode: "Plain",
};

export type Caixa = { x: number; y: number; largura: number; altura: number };

export type CodigoLido = {
  texto: string;
  formato: string;
  simbologia: string;
  caixa: Caixa | null;
};

let preparo: Promise<void> | null = null;
let wasmTeste: ArrayBuffer | null = null;

/** Só para o vitest, que não busca o wasm pelo endereço do Vite. */
export function usarWasmEmTeste(binario: ArrayBuffer): void {
  wasmTeste = binario;
  preparo = null;
}

function preparar(): Promise<void> {
  if (preparo) return preparo;
  const overrides: ZXingModuleOverrides = wasmTeste
    ? ({ wasmBinary: wasmTeste } as ZXingModuleOverrides)
    : { locateFile: (caminho: string, prefixo: string) => (caminho.endsWith(".wasm") ? wasmUrl : prefixo + caminho) };
  preparo = Promise.resolve(prepareZXingModule({ overrides, fireImmediately: true })).then(() => undefined);
  return preparo;
}

function caixaDe(position: { topLeft: { x: number; y: number }; topRight: { x: number; y: number }; bottomLeft: { x: number; y: number }; bottomRight: { x: number; y: number } } | null | undefined): Caixa | null {
  if (!position) return null;
  const xs = [position.topLeft.x, position.topRight.x, position.bottomLeft.x, position.bottomRight.x];
  const ys = [position.topLeft.y, position.topRight.y, position.bottomLeft.y, position.bottomRight.y];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, largura: Math.max(...xs) - x, altura: Math.max(...ys) - y };
}

export async function lerCodigo(
  entrada: Blob | ImageData | Uint8Array | { width: number; height: number; data: Uint8ClampedArray },
): Promise<CodigoLido | null> {
  await preparar();
  const resultados = await readBarcodes(entrada as ImageData, OPCOES);
  const ok = resultados.find((item) => item.text && !item.error);
  if (!ok) return null;
  const simbologia = ok.symbologyIdentifier ?? "";
  const texto = simbologia.startsWith("]") && !ok.text.startsWith("]") ? `${simbologia}${ok.text}` : ok.text;
  return { texto, formato: String(ok.format), simbologia, caixa: caixaDe(ok.position) };
}
