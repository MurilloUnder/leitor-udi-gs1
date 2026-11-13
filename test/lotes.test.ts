import { describe, expect, it } from "vitest";
import { agruparLeituras, leituraAbreLoteNovo, loteAberto } from "../src/lotes";
import type { Leitura } from "../src/udi/tipos";
import type { Resultado } from "../src/udi/tipos";

function leitura(parcial: {
  id: string;
  quando: string;
  di: string;
  lote?: string;
  serie?: string;
  validade?: string;
  conferencia?: string;
  modelo?: string;
}): Leitura {
  const resultado = {
    di: parcial.di,
    campos: [
      ...(parcial.lote ? [{ ai: "10", rotulo: "(10) Lote", valor: parcial.lote, detalhe: "" }] : []),
      ...(parcial.serie ? [{ ai: "21", rotulo: "(21) Número de série", valor: parcial.serie, detalhe: "" }] : []),
    ],
    validades: parcial.validade ? [{ iso: parcial.validade, origem: "GS1 (17)" }] : [],
  } as Resultado;
  return {
    id: parcial.id,
    quando: parcial.quando,
    origem: "texto",
    resultado,
    conferencia: parcial.conferencia ?? "OK",
    conferenciaDetalhe: "",
    modelo: parcial.modelo ?? "Sonda",
    nivel: "unidade",
    extras: {},
    checklist: null,
    trilha: [],
    temImagem: false,
  };
}

describe("lotes de conferência", () => {
  const base = [
    leitura({ id: "a", quando: "2026-11-13 09:00:00", di: "111", lote: "L1", serie: "S1", validade: "2027-01-01" }),
    leitura({ id: "b", quando: "2026-11-13 09:01:00", di: "111", lote: "L1", serie: "S2" }),
    leitura({ id: "c", quando: "2026-11-13 09:02:00", di: "111", lote: "L1", serie: "S1", conferencia: "nível divergente" }),
    leitura({ id: "d", quando: "2026-11-13 10:00:00", di: "222", lote: "L9", modelo: "Cateter", conferencia: "GTIN não cadastrado" }),
  ];

  it("junta leituras consecutivas do mesmo DI e lote e abre outro quando muda", () => {
    const lotes = agruparLeituras(base, "produto", []);
    expect(lotes.map((l) => l.quantidade)).toEqual([1, 3]);
    expect(lotes[1].di).toBe("111");
    expect(lotes[1].lote).toBe("L1");
    expect(lotes[1].ok).toBe(2);
    expect(lotes[1].divergentes).toBe(1);
    expect(lotes[1].seriaisRepetidos).toEqual([{ serie: "S1", vezes: 2 }]);
    expect(lotes[1].validade).toBe("2027-01-01");
    expect(lotes[0].modelo).toBe("Cateter");
    expect(leituraAbreLoteNovo(agruparLeituras(base.slice(0, 3), "produto", []), lotes[0])).toBe(true);
    expect(loteAberto(lotes)?.quantidade).toBe(1);
  });

  it("fecha a lista na mão e não mistura o dia inteiro no modo produto", () => {
    const fechado = agruparLeituras(base.slice(0, 2), "produto", ["b"]);
    expect(fechado[0].fechado).toBe(true);
    expect(loteAberto(fechado)).toBeNull();
    const comNova = agruparLeituras(
      [...base.slice(0, 2), leitura({ id: "e", quando: "2026-11-13 09:05:00", di: "111", lote: "L1" })],
      "produto",
      ["b"],
    );
    expect(comNova.map((l) => l.quantidade)).toEqual([1, 2]);
    expect(comNova[0].ids).toEqual(["e"]);
  });

  it("agrupa por dia ou por hora", () => {
    const dia = agruparLeituras(base, "dia", []);
    expect(dia).toHaveLength(1);
    expect(dia[0].quantidade).toBe(4);
    expect(dia[0].variosProdutos).toBe(true);
    const hora = agruparLeituras(base, "hora", []);
    expect(hora.map((l) => l.quantidade).sort()).toEqual([1, 3]);
  });
});
