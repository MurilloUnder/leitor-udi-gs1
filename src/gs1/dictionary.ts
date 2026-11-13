import bruto from "../../vendor/gs1-syntax-dictionary/gs1-syntax-dictionary.txt?raw";
import type { TipoDado } from "./charset";

export type Componente = {
  tipo: TipoDado;
  minimo: number;
  maximo: number;
  opcional: boolean;
  linters: string[];
};

export type EntradaAi = {
  ai: string;
  /** Comprimento predefinido (* no dicionário) e sem parte opcional. */
  fixo: boolean;
  /** Exige separador FNC1/GS quando não é o último campo. */
  fnc1: boolean;
  atributoDigitalLink: boolean;
  titulo: string;
  componentes: Componente[];
  minimo: number;
  maximo: number;
  dlpkey: string;
};

const RE_COMP =
  /^(\[)?([NXYZ])(?:(\d+)|\.\.(\d+))((?:,[A-Za-z0-9]+)*)(\])?((?:,[A-Za-z0-9]+)*)$/;

function componente(token: string): Componente | null {
  const m = RE_COMP.exec(token);
  if (!m) return null;
  const opcional = Boolean(m[1]);
  if (opcional && !m[6]) return null;
  const tipo = m[2] as TipoDado;
  const exato = m[3] ? Number(m[3]) : null;
  const maxVar = m[4] ? Number(m[4]) : null;
  const linters = `${m[5] || ""}${m[7] || ""}`.split(",").filter(Boolean);
  if (exato != null) return { tipo, minimo: exato, maximo: exato, opcional, linters };
  return { tipo, minimo: 1, maximo: maxVar ?? 1, opcional, linters };
}

function linha(texto: string): EntradaAi[] | null {
  const hash = texto.indexOf("#");
  const titulo = hash >= 0 ? texto.slice(hash + 1).trim() : "";
  const corpo = (hash >= 0 ? texto.slice(0, hash) : texto).trim();
  if (!corpo) return null;
  const tokens = corpo.split(/\s+/);
  const aiTok = tokens.shift();
  if (!aiTok || !/^\d{2,4}(?:-\d{2,4})?$/.test(aiTok)) return null;
  let flags = "";
  if (tokens[0] && /^[*?]+$/.test(tokens[0])) flags = tokens.shift() ?? "";
  const componentes: Componente[] = [];
  const atributos: string[] = [];
  for (const token of tokens) {
    const comp = componente(token);
    if (comp && atributos.length === 0) componentes.push(comp);
    else atributos.push(token);
  }
  if (componentes.length === 0) return null;
  let minimo = 0;
  let maximo = 0;
  for (const comp of componentes) {
    maximo += comp.maximo;
    if (!comp.opcional) minimo += comp.minimo;
  }
  const estrela = flags.includes("*");
  const base = {
    fixo: estrela && minimo === maximo,
    fnc1: !estrela,
    atributoDigitalLink: flags.includes("?"),
    titulo,
    componentes,
    minimo,
    maximo,
    dlpkey: atributos.find((a) => a === "dlpkey" || a.startsWith("dlpkey=")) ?? "",
  };
  const codigos: string[] = [];
  if (aiTok.includes("-")) {
    const [inicio, fim] = aiTok.split("-");
    const largura = inicio.length;
    for (let n = Number(inicio); n <= Number(fim); n++) {
      codigos.push(String(n).padStart(largura, "0"));
    }
  } else {
    codigos.push(aiTok);
  }
  return codigos.map((ai) => ({ ai, ...base }));
}

let cache: Map<string, EntradaAi> | null = null;

export function tabelaGs1(): Map<string, EntradaAi> {
  if (cache) return cache;
  const mapa = new Map<string, EntradaAi>();
  for (const bruta of bruto.split(/\r?\n/)) {
    const texto = bruta.trim();
    if (!texto || texto.startsWith("#")) continue;
    const entradas = linha(texto);
    if (!entradas) continue;
    for (const entrada of entradas) mapa.set(entrada.ai, entrada);
  }
  cache = mapa;
  return mapa;
}

export function entradaAi(ai: string): EntradaAi | undefined {
  return tabelaGs1().get(ai);
}

export function textoDicionario(): string {
  return bruto;
}
