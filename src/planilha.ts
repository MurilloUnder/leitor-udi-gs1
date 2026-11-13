import * as XLSX from "xlsx";
import { normalizarTexto, type LinhaReferencia } from "./conferencia";

function coluna(titulo: string): "modelo" | "nivel" | "di" | "extra" {
  const nome = normalizarTexto(titulo);
  if (["modelo", "model", "produto", "descricao", "nome"].includes(nome)) return "modelo";
  if (["nivel", "nivel de embalagem", "embalagem", "package", "package level"].includes(nome)) return "nivel";
  if (
    nome === "gtin" ||
    nome === "di" ||
    nome === "udi" ||
    nome === "udi-di" ||
    nome === "identificador" ||
    nome === "codigo" ||
    nome === "codigo de barras" ||
    nome.includes("gtin")
  ) {
    return "di";
  }
  return "extra";
}

function deObjetos(objetos: Record<string, unknown>[]): LinhaReferencia[] {
  if (objetos.length === 0) return [];
  const chaves = Object.keys(objetos[0]);
  const mapa = new Map(chaves.map((chave) => [chave, coluna(chave)]));
  if (![...mapa.values()].includes("di")) {
    throw new Error("A planilha precisa de uma coluna GTIN ou DI.");
  }
  const linhas: LinhaReferencia[] = [];
  for (const objeto of objetos) {
    const linha: LinhaReferencia = { modelo: "", nivel: "", di: "", extras: {} };
    for (const [chave, valor] of Object.entries(objeto)) {
      const texto = String(valor ?? "").trim();
      if (!texto) continue;
      const tipo = mapa.get(chave) ?? "extra";
      if (tipo === "modelo") linha.modelo = texto;
      else if (tipo === "nivel") linha.nivel = texto;
      else if (tipo === "di") linha.di = texto;
      else linha.extras[chave] = texto;
    }
    if (linha.di) linhas.push(linha);
  }
  return linhas;
}

export function lerPlanilha(dados: ArrayBuffer, nome: string): LinhaReferencia[] {
  const texto = nome.toLowerCase().endsWith(".csv") ? new TextDecoder("utf-8").decode(dados).replace(/^\uFEFF/, "") : "";
  if (texto) {
    const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
    const separador = primeira.includes(";") && !primeira.includes(",") ? ";" : ",";
    const livro = XLSX.read(texto, { type: "string", FS: separador });
    const aba = livro.Sheets[livro.SheetNames[0]];
    const objetos = XLSX.utils.sheet_to_json<Record<string, unknown>>(aba, { defval: "", raw: false });
    return deObjetos(objetos);
  }
  const livro = XLSX.read(dados, { type: "array" });
  const aba = livro.Sheets[livro.SheetNames[0]];
  const objetos = XLSX.utils.sheet_to_json<Record<string, unknown>>(aba, { defval: "", raw: false });
  return deObjetos(objetos);
}

export function planilhaParaXlsx(linhas: Record<string, string>[]): Blob {
  const aba = XLSX.utils.json_to_sheet(linhas);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, aba, "Leituras");
  const binario = XLSX.write(livro, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([binario], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function planilhaParaCsv(linhas: Record<string, string>[]): Blob {
  const aba = XLSX.utils.json_to_sheet(linhas);
  const csv = XLSX.utils.sheet_to_csv(aba, { FS: ";" });
  return new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
}
