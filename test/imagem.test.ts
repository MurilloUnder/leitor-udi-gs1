import { readFileSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import bwipjs from "bwip-js";
import { PNG } from "pngjs";
import { lerCodigo, lerQuadro, usarWasmEmTeste } from "../src/scan";
import { lerUdi } from "../src/udi/ler";

function pixels(png: Buffer): { width: number; height: number; data: Uint8ClampedArray } {
  const lido = PNG.sync.read(png);
  const data = new Uint8ClampedArray(lido.data.length);
  for (let i = 0; i < lido.data.length; i += 4) {
    const alfa = lido.data[i + 3] / 255;
    data[i] = 255 * (1 - alfa) + lido.data[i] * alfa;
    data[i + 1] = 255 * (1 - alfa) + lido.data[i + 1] * alfa;
    data[i + 2] = 255 * (1 - alfa) + lido.data[i + 2] * alfa;
    data[i + 3] = 255;
  }
  return { width: lido.width, height: lido.height, data };
}

beforeAll(() => {
  const bytes = readFileSync("node_modules/zxing-wasm/dist/reader/zxing_reader.wasm");
  usarWasmEmTeste(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
});

const GTIN = "51022222233336";

describe("imagem", () => {
  it("gera e lê um DataMatrix GS1", async () => {
    const png = await bwipjs.toBuffer({
      bcid: "gs1datamatrix",
      text: `(01)${GTIN}(17)261231(10)ABC123`,
      scale: 6,
      paddingwidth: 16,
      paddingheight: 16,
    });
    writeFileSync("public/exemplos/datamatrix-exemplo.png", png);
    const lido = await lerCodigo(pixels(png));
    expect(lido?.texto).toBeTruthy();
    const resultado = lerUdi(lido!.texto, {
      hoje: { ano: 2026, mes: 1, dia: 1 },
      anoCorrente: 2026,
    });
    expect(resultado.agencia).toBe("GS1");
    expect(resultado.di).toBe(GTIN);
    expect(resultado.campos.find((c) => c.ai === "10")?.valor).toBe("ABC123");
    expect(resultado.campos.find((c) => c.ai === "17")?.valor).toBe("261231");
  });

  it("lê um DataMatrix pequeno no centro de um quadro grande", async () => {
    const png = await bwipjs.toBuffer({
      bcid: "gs1datamatrix",
      text: `(01)${GTIN}(17)280330(10)LOTEEXEMPLO`,
      scale: 4,
      paddingwidth: 8,
      paddingheight: 8,
    });
    const simbolo = pixels(png);
    const lado = simbolo.width * 5;
    const data = new Uint8ClampedArray(lado * lado * 4);
    data.fill(255);
    const ox = Math.round((lado - simbolo.width) / 2);
    const oy = Math.round((lado - simbolo.height) / 2);
    for (let y = 0; y < simbolo.height; y++) {
      const origem = y * simbolo.width * 4;
      const destino = ((oy + y) * lado + ox) * 4;
      data.set(simbolo.data.subarray(origem, origem + simbolo.width * 4), destino);
    }
    const lido = await lerQuadro({ width: lado, height: lado, data });
    expect(lido?.formato).toBe("DataMatrix");
    const resultado = lerUdi(lido!.texto, { hoje: { ano: 2026, mes: 1, dia: 1 }, anoCorrente: 2026 });
    expect(resultado.di).toBe(GTIN);
    expect(resultado.validades[0]?.iso).toBe("2028-03-30");
  });

  it("lê um QR com GS1 Digital Link", async () => {
    const png = await bwipjs.toBuffer({
      bcid: "qrcode",
      text: `https://id.gs1.org/01/${GTIN}/10/LOTE9/17/261130`,
      scale: 4,
      paddingwidth: 8,
      paddingheight: 8,
    });
    writeFileSync("public/exemplos/qr-digital-link.png", png);
    const lido = await lerCodigo(pixels(png));
    const resultado = lerUdi(lido!.texto, {
      hoje: { ano: 2026, mes: 1, dia: 1 },
      anoCorrente: 2026,
    });
    expect(resultado.di).toBe(GTIN);
    expect(resultado.campos.find((c) => c.ai === "10")?.valor).toBe("LOTE9");
  });
});
