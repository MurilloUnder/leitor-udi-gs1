import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conferir, normalizarDi, type LinhaReferencia } from "../src/conferencia";
import { digitoGs1 } from "../src/gs1/checkdigit";
import { CSET39, CSET82 } from "../src/gs1/charset";
import { anoGs1 } from "../src/gs1/dates";
import { tabelaGs1, textoDicionario } from "../src/gs1/dictionary";
import { tituloPt } from "../src/gs1/titulos";
import { caractereMod43 } from "../src/hibcc/mod43";
import { QUALIFICADORES } from "../src/hibcc/parser";
import { caractereK } from "../src/isbt/mod372";
import { lerPlanilha } from "../src/planilha";
import { EXEMPLO_BOLSA, EXEMPLO_GS1, EXEMPLO_HIBCC, EXEMPLO_ISBT } from "../src/exemplos";
import { lerUdi } from "../src/udi/ler";
import type { Dia } from "../src/udi/tipos";
import elementos from "../src/dados/elementos-udi.json";

const GS = "\u001d";
const HOJE: Dia = { ano: 2026, mes: 11, dia: 13 };
const GTIN = "51022222233336";

function ler(bruto: string, hoje: Dia = HOJE, ano = hoje.ano, substitutoGs = "|") {
  return lerUdi(bruto, { hoje, anoCorrente: ano, substitutoGs });
}

describe("dicionário GS1", () => {
  it("carrega o arquivo vendido e os AIs de UDI", () => {
    expect(textoDicionario()).toContain("Apache License");
    const tabela = tabelaGs1();
    expect(tabela.size).toBeGreaterThan(300);
    expect(tabela.get("01")).toMatchObject({ fixo: true, maximo: 14, titulo: "GTIN" });
    expect(tabela.get("00")).toMatchObject({ fixo: true, maximo: 18 });
    expect(tabela.get("10")).toMatchObject({ fixo: false, maximo: 20, titulo: "BATCH/LOT" });
    expect(tabela.get("17")?.componentes[0].linters).toContain("yymmd0");
    expect(tabela.get("21")?.maximo).toBe(20);
    expect(tabela.get("8200")?.titulo).toBe("PRODUCT URL");
    expect(tabela.get("7004")?.titulo).toBe("ACTIVE POTENCY");
    expect(tabela.has("91") && tabela.has("99") && tabela.has("3100") && tabela.has("3105")).toBe(true);
    const estranhos = [...tabela.values()].filter((e) => !e.fnc1 && !e.fixo).map((e) => e.ai);
    expect(estranhos).toEqual([]);
  });

  it("traduz os títulos oficiais", () => {
    expect(tituloPt("BATCH/LOT")).toBe("Lote");
    expect(tituloPt("USE BY or EXPIRY")).toBe("Validade");
    expect(tituloPt("NET WEIGHT (kg)")).toBe("Peso líquido (kg)");
    expect(tituloPt("SHIP TO ADD1")).toBe("Destinatário — endereço 1");
    const siglas = new Set(["GTIN", "IBAN", "IMEI", "IMEI2", "CPID", "CPV", "TPX", "NSN", "GCN", "GDTI", "GIAI", "GINC", "GSIN", "GMN", "GRAI", "MUDI", "SRIN", "VCN"]);
    const faltam = [...new Set([...tabelaGs1().values()].map((e) => e.titulo).filter(Boolean))].filter((titulo) => {
      if (tituloPt(titulo) !== titulo) return false;
      if (siglas.has(titulo) || titulo.startsWith("NHRN ")) return false;
      return true;
    });
    expect(faltam).toEqual([]);
  });
});

describe("conjuntos e dígitos", () => {
  it("tem 82 e 39 caracteres e o módulo 10 da GS1", () => {
    expect(CSET82.length).toBe(82);
    expect(CSET39.length).toBe(39);
    expect(digitoGs1("5102222223333")).toBe(6);
    expect(caractereK("G123417654321")).toBe("A");
  });

  it("aplica o século rolante do linter GS1", () => {
    expect(anoGs1(0, 2021)).toBe(2000);
    expect(anoGs1(21, 2021)).toBe(2021);
    expect(anoGs1(71, 2021)).toBe(2071);
    expect(anoGs1(75, 2021)).toBe(1975);
  });
});

describe("parser GS1", () => {
  it("separa o exemplo FDA em parênteses", () => {
    const r = ler(EXEMPLO_GS1, { ano: 2015, mes: 7, dia: 7 });
    expect(r.agencia).toBe("GS1");
    expect(r.campos.map((c) => [c.ai, c.valor])).toEqual([
      ["01", GTIN],
      ["11", "141231"],
      ["17", "150707"],
      ["10", "A213B1"],
      ["21", "1234"],
    ]);
    expect(r.erros).toEqual([]);
    expect(r.hri).toBe(EXEMPLO_GS1);
    expect(r.vencido).toBeNull();
  });

  it("separa AI fixo e variável no GS, no ]d2 e no substituto", () => {
    const comGs = `]d201${GTIN}1726123110ABC123${GS}21SN9`;
    const lido = ler(comGs);
    expect(lido.simbologia).toBe("]d2");
    expect(lido.campos.map((c) => c.valor)).toEqual([GTIN, "261231", "ABC123", "SN9"]);
    const semGs = `01${GTIN}10ABC12321SN9`;
    expect(ler(semGs).campos.map((c) => c.valor)).toEqual([GTIN, "ABC12321SN9"]);
    const pipe = `]C101${GTIN}10LOTE|21SERIE`;
    expect(ler(pipe).campos.map((c) => [c.ai, c.valor])).toEqual([
      ["01", GTIN],
      ["10", "LOTE"],
      ["21", "SERIE"],
    ]);
    const token = `01${GTIN}10LOTE<GS>21SERIE`;
    expect(ler(token, HOJE, 2026, "").campos.at(-1)?.valor).toBe("SERIE");
  });

  it("lê GS1 Digital Link no caminho e na consulta", () => {
    const r = ler(`https://id.gs1.org/01/${GTIN}/10/ABC123?17=261231`);
    expect(r.campos.map((c) => [c.ai, c.valor])).toEqual([
      ["01", GTIN],
      ["10", "ABC123"],
      ["17", "261231"],
    ]);
    expect(r.informes.some((t) => t.includes("Digital Link"))).toBe(true);
  });

  it("recusa dígito, data, caractere, AI desconhecido, indicador 9 e SSCC", () => {
    expect(ler(`(01)51022222233335`).erros.some((t) => t.includes("Dígito verificador"))).toBe(true);
    const diaZero = ler("(17)261200");
    expect(diaZero.erros).toEqual([]);
    expect(diaZero.campos[0].detalhe).toContain("31/12/2026");
    expect(diaZero.campos[0].detalhe).toContain("fim do mês");
    expect(ler("(17)261332").erros.some((t) => t.includes("Data inválida"))).toBe(true);
    expect(ler("(17)210229", HOJE, 2021).erros.some((t) => t.includes("Data inválida"))).toBe(true);
    expect(ler("(17)000229", { ano: 2000, mes: 2, dia: 1 }, 2021).erros).toEqual([]);
    expect(ler("(17)750606", HOJE, 2021).campos[0].detalhe).toContain("06/06/1975");
    expect(ler("(10)AB CD").erros.some((t) => t.includes("CSET 82"))).toBe(true);
    expect(ler("89ABC").avisos.some((t) => t.includes("desconhecido"))).toBe(true);
    const corpo9 = "9999000000003";
    const ind9 = `${corpo9}${digitoGs1(corpo9)}`;
    expect(ler(`(01)${ind9}(17)301231`).avisos.some((t) => t.includes("indicador 9"))).toBe(true);
    const sem = "00000000000000000";
    const sscc = `${sem}${digitoGs1(sem)}`;
    expect(ler(`(00)${sscc}`).avisos.some((t) => t.includes("SSCC"))).toBe(true);
  });

  it("alerta validade vencida e omite 8200 e 7004 do HRI", () => {
    expect(ler(EXEMPLO_GS1).vencido).toContain("Validade vencida");
    const r = ler(`(01)${GTIN}(17)261231(10)ABC123(7004)10(8200)https://exemplo.invalid/x`);
    expect(r.hri).toBe(`(01)${GTIN}(17)261231(10)ABC123`);
    expect(r.hriNotas.some((t) => t.includes("8200"))).toBe(true);
    expect(r.hriNotas.some((t) => t.includes("7004"))).toBe(true);
  });
});

describe("HIBCC", () => {
  it("separa o exemplo FDA e aponta o Mod 43", () => {
    const r = ler(EXEMPLO_HIBCC, { ano: 2020, mes: 2, dia: 2 });
    expect(r.agencia).toBe("HIBCC");
    expect(r.di).toBe("H123PARTNO1234567890120");
    expect(r.campos.find((c) => c.rotulo.startsWith("Data"))?.valor).toBe("20020216");
    expect(r.campos.find((c) => c.rotulo.startsWith("Lote"))?.valor).toBe("LOT123456789012345");
    expect(r.campos.find((c) => c.ai === "/S")?.valor).toBe("XYZ456789012345678");
    expect(r.campos.find((c) => c.ai === "/16D")?.valor).toBe("20130202");
    expect(r.erros.some((t) => t.includes("Mod 43") && t.includes("H") && t.includes("C"))).toBe(true);
    expect(r.vencido).toBeNull();
  });

  it("confere o exemplo do apêndice Mod 43 e os delimitadores da tabela", () => {
    const exemplo = "+A123BJC5D6E71G";
    expect(caractereMod43(exemplo.slice(0, -1))).toBe("G");
    const primario = ler(exemplo);
    expect(primario.di).toBe("A123BJC5D6E71");
    expect(primario.erros).toEqual([]);

    const di = "H999TESTE";
    for (const qual of QUALIFICADORES) {
      const data = qual.formato === "MMYY" ? "1226"
        : qual.formato === "MMDDYY" ? "123126"
        : qual.formato === "YYMMDD" ? "261231"
        : qual.formato === "YYMMDDHH" ? "26123108"
        : qual.formato === "YYJJJ" ? "26332"
        : qual.formato === "YYJJJHH" ? "2633208"
        : "";
      const carga = qual.depois === "serie" ? "SERIE1" : qual.depois === "lote" ? "LOTE1" : "";
      const corpo = `+${di}/${qual.id}${data}${carga}/14D20261231`;
      const codigo = corpo + caractereMod43(corpo);
      const lido = ler(codigo, { ano: 2026, mes: 12, dia: 31 });
      expect(lido.di, qual.id).toBe(di);
      expect(lido.erros, qual.id).toEqual([]);
      expect(lido.campos.some((c) => c.ai === qual.id), qual.id).toBe(true);
      expect(lido.campos.some((c) => c.ai === "/14D"), qual.id).toBe(true);
      if (qual.legado) expect(lido.avisos.some((t) => t.includes("compatibilidade")), qual.id).toBe(true);
    }
  });
});

describe("ISBT 128", () => {
  it("separa o exemplo FDA e a bolsa", () => {
    const r = ler(EXEMPLO_ISBT, { ano: 2014, mes: 2, dia: 1 });
    expect(r.agencia).toBe("ICCBBA");
    expect(r.di).toBe("A9999XYZ100T0944");
    expect(r.campos.find((c) => c.ai === "=,")?.valor).toBe("000025");
    expect(r.campos.find((c) => c.ai === "=")?.valor).toBe("A99971312345600");
    expect(r.campos.find((c) => c.ai === "=>")?.detalhe).toContain("01/02/2014");
    expect(r.campos.find((c) => c.ai === "=}")?.detalhe).toContain("01/02/2013");
    expect(r.campos.find((c) => c.ai === "&,1")?.valor).toBe("000000000000XYZ123");
    expect(r.informes.some((t) => t.includes("K") && t.includes("S"))).toBe(true);
    expect(r.erros).toEqual([]);
    expect(r.vencido).toBeNull();

    const bolsa = ler(EXEMPLO_BOLSA);
    expect(bolsa.di).toBe("1TE123456A");
    expect(bolsa.campos.find((c) => c.ai === "&)")?.valor).toBe("RZ12345678");
    expect(bolsa.erros).toEqual([]);
  });
});

describe("conferência e elementos", () => {
  const linhas: LinhaReferencia[] = [
    { modelo: "Sonda Exemplo Alfa", nivel: "blister", di: GTIN, extras: { "quantidade por embalagem": "10" } },
    { modelo: "Peça Exemplo HIBCC", nivel: "unidade", di: "H999EXEMPLO01", extras: {} },
  ];

  it("compara GTIN, nível e DI de outra agência", () => {
    expect(normalizarDi("51022222233336")).toBe("51022222233336");
    const ok = conferir(GTIN, "GS1", "Blister", linhas);
    expect(ok.status).toBe("ok");
    expect(ok.rotulo).toBe("OK");
    expect(ok.extras["quantidade por embalagem"]).toBe("10");
    const divergente = conferir(GTIN, "GS1", "caixa", linhas);
    expect(divergente.rotulo).toBe("nível divergente");
    expect(conferir("00000000000000", "GS1", "blister", linhas).rotulo).toBe("GTIN não cadastrado");
    expect(conferir("h999exemplo01", "HIBCC", "unidade", linhas).rotulo).toBe("OK");
    expect(conferir("Z0000NAOEXISTE01", "ICCBBA", "unidade", linhas).rotulo).toBe("DI não cadastrado");
    expect(conferir(GTIN, "GS1", "blister", []).rotulo).toBe("Sem planilha");
  });

  it("lê a planilha de exemplo e guarda a comparação enxuta", () => {
    const buf = readFileSync("public/exemplos/referencia-exemplo.csv");
    const lidas = lerPlanilha(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "referencia-exemplo.csv");
    expect(lidas.some((l) => l.di === "09990000000012" && l.nivel === "unidade" && l.extras["quantidade por embalagem"] === "1")).toBe(true);
    expect(elementos.itens.length).toBeGreaterThan(50);
    expect(elementos.itens.length).toBeLessThan(200);
    expect(elementos.itens.some((item) => item.imdrf.includes("UDI-DI"))).toBe(true);
    expect(elementos.fontes.find((f) => f.base === "GUDID")?.url).toContain("fda.gov");
    expect(elementos.notas.some((n) => n.includes("SIUD"))).toBe(true);
    expect(JSON.stringify(elementos).length).toBeLessThan(40000);
  });
});
