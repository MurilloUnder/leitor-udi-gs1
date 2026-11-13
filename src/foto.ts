import type { Caixa } from "./scan";

function quadro(origem: CanvasImageSource, largura: number, altura: number, maxLado: number, caixa: Caixa | null): HTMLCanvasElement {
  const escala = Math.min(1, maxLado / Math.max(largura, altura));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(largura * escala));
  canvas.height = Math.max(1, Math.round(altura * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(origem, 0, 0, canvas.width, canvas.height);
  if (caixa && caixa.largura > 2 && caixa.altura > 2) {
    ctx.strokeStyle = "#ffbf3c";
    ctx.lineWidth = Math.max(2, Math.round(canvas.width / 180));
    ctx.strokeRect(caixa.x * escala, caixa.y * escala, caixa.largura * escala, caixa.altura * escala);
  }
  return canvas;
}

function blobDe(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("não gerou JPEG"))), "image/jpeg", qualidade);
  });
}

export async function fotosDe(
  origem: CanvasImageSource,
  largura: number,
  altura: number,
  caixa: Caixa | null,
): Promise<{ foto: Blob; mini: Blob }> {
  const grande = quadro(origem, largura, altura, Math.max(largura, altura), caixa);
  const mini = quadro(origem, largura, altura, 280, caixa);
  return { foto: await blobDe(grande, 0.85), mini: await blobDe(mini, 0.7) };
}

export async function fotosDeArquivo(arquivo: Blob, caixa: Caixa | null): Promise<{ foto: Blob; mini: Blob }> {
  const bitmap = await createImageBitmap(arquivo);
  try {
    return await fotosDe(bitmap, bitmap.width, bitmap.height, caixa);
  } finally {
    bitmap.close();
  }
}
