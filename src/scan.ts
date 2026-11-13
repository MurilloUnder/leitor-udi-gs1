import { prepareZXingModule, readBarcodes, type ReaderOptions, type ZXingModuleOverrides } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

const OPCOES: ReaderOptions = {
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  // 1080p fica inteiro; 4K ainda tenta uma passada menor. Abaixo disso o DataMatrix pequeno some.
  downscaleThreshold: 1800,
  formats: ["DataMatrix", "QRCode", "Code128", "DataBar", "DataBarExpanded", "DataBarLimited"],
  maxNumberOfSymbols: 1,
  textMode: "Plain",
};

export type QuadroPixels = { width: number; height: number; data: Uint8ClampedArray };

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
  entrada: Blob | ImageData | Uint8Array | QuadroPixels,
): Promise<CodigoLido | null> {
  await preparar();
  const resultados = await readBarcodes(entrada as ImageData, OPCOES);
  const ok = resultados.find((item) => item.text && !item.error);
  if (!ok) return null;
  const simbologia = ok.symbologyIdentifier ?? "";
  const texto = simbologia.startsWith("]") && !ok.text.startsWith("]") ? `${simbologia}${ok.text}` : ok.text;
  return { texto, formato: String(ok.format), simbologia, caixa: caixaDe(ok.position) };
}

function copiarRetangulo(origem: QuadroPixels, x: number, y: number, largura: number, altura: number): QuadroPixels {
  const data = new Uint8ClampedArray(largura * altura * 4);
  for (let linha = 0; linha < altura; linha++) {
    const inicio = ((y + linha) * origem.width + x) * 4;
    data.set(origem.data.subarray(inicio, inicio + largura * 4), linha * largura * 4);
  }
  return { width: largura, height: altura, data };
}

function quadradoCentral(imagem: QuadroPixels, fracao: number): { quadro: QuadroPixels; x: number; y: number } {
  const ladoBase = Math.min(imagem.width, imagem.height);
  const lado = Math.max(32, Math.min(ladoBase, Math.round(ladoBase * fracao)));
  const x = Math.max(0, Math.floor((imagem.width - lado) / 2));
  const y = Math.max(0, Math.floor((imagem.height - lado) / 2));
  return { quadro: copiarRetangulo(imagem, x, y, lado, lado), x, y };
}

function ampliar(origem: QuadroPixels, fator: number): QuadroPixels {
  const largura = origem.width * fator;
  const altura = origem.height * fator;
  const data = new Uint8ClampedArray(largura * altura * 4);
  for (let y = 0; y < altura; y++) {
    const origemY = Math.floor(y / fator);
    for (let x = 0; x < largura; x++) {
      const origemX = Math.floor(x / fator);
      const de = (origemY * origem.width + origemX) * 4;
      const para = (y * largura + x) * 4;
      data[para] = origem.data[de];
      data[para + 1] = origem.data[de + 1];
      data[para + 2] = origem.data[de + 2];
      data[para + 3] = 255;
    }
  }
  return { width: largura, height: altura, data };
}

function realcar(origem: QuadroPixels): QuadroPixels {
  const n = origem.width * origem.height;
  const luma = new Uint8Array(n);
  let min = 255;
  let max = 0;
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    const y = (origem.data[i] * 0.299 + origem.data[i + 1] * 0.587 + origem.data[i + 2] * 0.114) | 0;
    luma[p] = y;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  const faixa = Math.max(1, max - min);
  const data = new Uint8ClampedArray(origem.data.length);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const v = Math.max(0, Math.min(255, Math.round(((luma[p] - min) * 255) / faixa)));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return { width: origem.width, height: origem.height, data };
}

function deslocar(caixa: Caixa | null, x: number, y: number, escala: number): Caixa | null {
  if (!caixa) return null;
  return {
    x: x + caixa.x / escala,
    y: y + caixa.y / escala,
    largura: caixa.largura / escala,
    altura: caixa.altura / escala,
  };
}

/**
 * Quadro inteiro, miolo central, miolo ampliado 2× e o mesmo miolo em cinza com contraste.
 * O retângulo volta para as coordenadas do quadro original.
 */
export async function lerQuadro(imagem: QuadroPixels): Promise<CodigoLido | null> {
  const centro = quadradoCentral(imagem, 0.46);
  const miolo = quadradoCentral(imagem, 0.3);
  const tentativas: { quadro: QuadroPixels; x: number; y: number; escala: number }[] = [
    { quadro: centro.quadro, x: centro.x, y: centro.y, escala: 1 },
    { quadro: ampliar(miolo.quadro, 2), x: miolo.x, y: miolo.y, escala: 2 },
    { quadro: realcar(centro.quadro), x: centro.x, y: centro.y, escala: 1 },
    { quadro: imagem, x: 0, y: 0, escala: 1 },
  ];
  for (const tentativa of tentativas) {
    const lido = await lerCodigo(tentativa.quadro);
    if (!lido) continue;
    return { ...lido, caixa: deslocar(lido.caixa, tentativa.x, tentativa.y, tentativa.escala) };
  }
  return null;
}
