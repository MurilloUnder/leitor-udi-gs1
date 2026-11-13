import type { Leitura } from "./udi/tipos";

export type ModoAgrupamento = "produto" | "dia" | "hora";

export type Identidade = {
  di: string;
  lote: string;
  serie: string;
  validade: string;
};

export type SerialRepetida = { serie: string; vezes: number };

export type LoteConferencia = {
  id: string;
  modo: ModoAgrupamento;
  di: string;
  lote: string;
  modelo: string;
  validade: string;
  inicio: string;
  fim: string;
  ids: string[];
  quantidade: number;
  ok: number;
  divergentes: number;
  seriaisRepetidos: SerialRepetida[];
  fechado: boolean;
  variosProdutos: boolean;
};

export function identidadeLeitura(leitura: Pick<Leitura, "resultado">): Identidade {
  const campos = leitura.resultado.campos;
  const lote =
    campos.find((c) => c.ai === "10")?.valor ??
    campos.find((c) => c.rotulo.startsWith("Lote"))?.valor ??
    "";
  const serie =
    campos.find((c) => c.ai === "21" || c.ai === "/S" || c.ai === "=,")?.valor ??
    campos.find((c) => c.rotulo.startsWith("Série"))?.valor ??
    "";
  return {
    di: (leitura.resultado.di ?? "").trim(),
    lote: lote.trim(),
    serie: serie.trim(),
    validade: leitura.resultado.validades[0]?.iso ?? "",
  };
}

function chaveProduto(id: Identidade): string {
  return `${id.di}\u0000${id.lote}`;
}

function chaveTempo(quando: string, modo: "dia" | "hora"): string {
  return modo === "dia" ? quando.slice(0, 10) : quando.slice(0, 13);
}

function divergente(rotulo: string): boolean {
  return rotulo === "GTIN não cadastrado" || rotulo === "DI não cadastrado" || rotulo === "nível divergente";
}

export function agruparLeituras(leituras: Leitura[], modo: ModoAgrupamento, cortes: readonly string[]): LoteConferencia[] {
  const ordem = [...leituras].sort((a, b) => (a.quando < b.quando ? -1 : a.quando > b.quando ? 1 : a.id < b.id ? -1 : 1));
  const corte = new Set(cortes);
  const lotes: LoteConferencia[] = [];
  let atual: LoteConferencia | null = null;
  let chaveAtual = "";

  for (const leitura of ordem) {
    const id = identidadeLeitura(leitura);
    const chave = modo === "produto" ? chaveProduto(id) : chaveTempo(leitura.quando, modo);
    const quebraManual = modo === "produto" && atual != null && corte.has(atual.ids[atual.ids.length - 1] ?? "");
    if (!atual || quebraManual || chave !== chaveAtual) {
      atual = {
        id: leitura.id,
        modo,
        di: id.di,
        lote: id.lote,
        modelo: leitura.modelo,
        validade: id.validade,
        inicio: leitura.quando,
        fim: leitura.quando,
        ids: [],
        quantidade: 0,
        ok: 0,
        divergentes: 0,
        seriaisRepetidos: [],
        fechado: false,
        variosProdutos: false,
      };
      chaveAtual = chave;
      lotes.push(atual);
    }
    atual.ids.push(leitura.id);
    atual.quantidade += 1;
    atual.fim = leitura.quando;
    if (!atual.modelo && leitura.modelo) atual.modelo = leitura.modelo;
    if (!atual.validade && id.validade) atual.validade = id.validade;
    if (atual.di && id.di && atual.di !== id.di) atual.variosProdutos = true;
    if (!atual.di && id.di) atual.di = id.di;
    if (leitura.conferencia === "OK") atual.ok += 1;
    if (divergente(leitura.conferencia)) atual.divergentes += 1;
  }

  for (const lote of lotes) {
    const serieConta = new Map<string, number>();
    for (const id of lote.ids) {
      const leitura = ordem.find((item) => item.id === id);
      if (!leitura) continue;
      const serie = identidadeLeitura(leitura).serie;
      if (!serie) continue;
      serieConta.set(serie, (serieConta.get(serie) ?? 0) + 1);
    }
    lote.seriaisRepetidos = [...serieConta.entries()]
      .filter(([, vezes]) => vezes > 1)
      .map(([serie, vezes]) => ({ serie, vezes }));
    if (modo === "produto") lote.fechado = corte.has(lote.ids[lote.ids.length - 1] ?? "");
    if (lote.variosProdutos) {
      lote.modelo = "Vários produtos";
      lote.di = "Vários";
      lote.lote = "";
    }
  }
  return lotes.reverse();
}

export function loteAberto(lotes: LoteConferencia[]): LoteConferencia | null {
  const ultimo = lotes[0];
  if (!ultimo || ultimo.fechado) return null;
  return ultimo;
}

export function leituraAbreLoteNovo(anteriores: LoteConferencia[], novo: LoteConferencia | undefined): boolean {
  if (!novo || novo.quantidade !== 1) return false;
  return anteriores.length > 0;
}
