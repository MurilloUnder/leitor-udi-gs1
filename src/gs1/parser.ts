import { conjunto, nomeConjunto } from "./charset";
import { digitoGs1, digitoGs1Confere } from "./checkdigit";
import { dataBr, lerAaaammdd, lerAammdd } from "./dates";
import { entradaAi, tabelaGs1, type EntradaAi } from "./dictionary";
import { tituloPt } from "./titulos";
import type { CampoVisivel } from "../udi/tipos";

const GS = "\u001d";

export type CampoGs1 = CampoVisivel & {
  entrada: EntradaAi | null;
  iso: string | null;
};

export type ParseGs1 = {
  forma: "elemento" | "parenteses" | "digital-link";
  campos: CampoGs1[];
  erros: string[];
  avisos: string[];
  informes: string[];
};

function separador(
  texto: string,
  inicio: number,
  substituto: string,
): { pos: number; len: number } | null {
  const candidatos: { pos: number; len: number }[] = [];
  const gs = texto.indexOf(GS, inicio);
  if (gs >= 0) candidatos.push({ pos: gs, len: 1 });
  for (const marca of ["<GS>", "{GS}"]) {
    const pos = texto.indexOf(marca, inicio);
    if (pos >= 0) candidatos.push({ pos, len: marca.length });
  }
  if (substituto) {
    const pos = texto.indexOf(substituto, inicio);
    if (pos >= 0) candidatos.push({ pos, len: substituto.length });
  }
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => a.pos - b.pos || b.len - a.len);
  return candidatos[0];
}

function casar(texto: string, i: number): EntradaAi | null {
  const tabela = tabelaGs1();
  for (const n of [4, 3, 2]) {
    if (i + n > texto.length) continue;
    const codigo = texto.slice(i, i + n);
    if (!/^\d+$/.test(codigo)) continue;
    const entrada = tabela.get(codigo);
    if (entrada) return entrada;
  }
  return null;
}

function validar(entrada: EntradaAi, valor: string, ano: number): { erros: string[]; iso: string | null; detalhe: string } {
  const erros: string[] = [];
  let pos = 0;
  let iso: string | null = null;
  let detalhe = "";
  for (const comp of entrada.componentes) {
    const falta = valor.length - pos;
    if (comp.opcional && falta <= 0) continue;
    const tamanho = comp.minimo === comp.maximo ? comp.maximo : Math.min(comp.maximo, Math.max(falta, 0));
    if (falta < (comp.opcional ? 0 : comp.minimo) || (comp.minimo === comp.maximo && falta < comp.maximo)) {
      erros.push(
        `O AI (${entrada.ai}) está curto: ${valor.length} caractere(s); o formato pede pelo menos ${entrada.minimo}.`,
      );
      break;
    }
    const pedaco = valor.slice(pos, pos + Math.min(tamanho, falta));
    if (pedaco.length > comp.maximo) {
      erros.push(`O AI (${entrada.ai}) passa de ${comp.maximo} caracteres.`);
    }
    const permitido = conjunto(comp.tipo);
    for (const ch of pedaco) {
      if (!permitido.includes(ch)) {
        const visivel = ch === " " ? "espaço" : ch === GS ? "GS" : ch;
        erros.push(
          `O AI (${entrada.ai}) contém "${visivel}", que não pertence ao conjunto ${nomeConjunto(comp.tipo)}.`,
        );
        break;
      }
    }
    if (comp.linters.includes("csum") && /^\d+$/.test(pedaco) && pedaco.length >= 2) {
      if (!digitoGs1Confere(pedaco)) {
        erros.push(
          `Dígito verificador inválido no AI (${entrada.ai}). Esperado ${digitoGs1(pedaco.slice(0, -1))}, encontrado ${pedaco.slice(-1)}.`,
        );
      }
    }
    if (comp.linters.includes("yymmd0") || comp.linters.includes("yymmdd")) {
      const lida = lerAammdd(pedaco, comp.linters.includes("yymmd0"), ano);
      if (!lida.ok) {
        erros.push(
          `Data inválida no AI (${entrada.ai}): "${pedaco}". ${lida.erro}. O formato é AAMMDD${comp.linters.includes("yymmd0") ? "; dia 00 significa o fim do mês" : ""}.`,
        );
      } else {
        iso = lida.iso;
        detalhe = dataBr(lida.iso) + (lida.diaZero ? " (dia 00: fim do mês)" : "");
      }
    }
    if (comp.linters.includes("yyyymmdd")) {
      const lida = lerAaaammdd(pedaco);
      if (!lida.ok) erros.push(`Data inválida no AI (${entrada.ai}): "${pedaco}". ${lida.erro}.`);
      else {
        iso = lida.iso;
        detalhe = dataBr(lida.iso);
      }
    }
    pos += pedaco.length;
  }
  if (pos < valor.length && erros.length === 0) {
    erros.push(`O AI (${entrada.ai}) tem dado a mais (${valor.length}; máximo ${entrada.maximo}).`);
  }
  return { erros, iso, detalhe };
}

function campoDe(entrada: EntradaAi | null, ai: string, valor: string, ano: number): CampoGs1 {
  if (!entrada) {
    return {
      ai,
      rotulo: `(${ai}) AI desconhecido`,
      valor,
      detalhe: "",
      entrada: null,
      iso: null,
    };
  }
  const checagem = validar(entrada, valor, ano);
  return {
    ai,
    rotulo: `(${ai}) ${tituloPt(entrada.titulo)}`,
    valor,
    detalhe: checagem.detalhe,
    entrada,
    iso: checagem.iso,
  };
}

function errosDoCampo(campo: CampoGs1, ano: number): string[] {
  if (!campo.entrada) return [`AI (${campo.ai}) desconhecido. O dicionário GS1 não tem esse código.`];
  return validar(campo.entrada, campo.valor, ano).erros;
}

function parseElemento(texto: string, substituto: string, ano: number): ParseGs1 {
  const campos: CampoGs1[] = [];
  const erros: string[] = [];
  const avisos: string[] = [];
  let i = 0;
  while (i < texto.length) {
    const pulo = separador(texto, i, substituto);
    if (pulo && pulo.pos === i) {
      i += pulo.len;
      continue;
    }
    const entrada = casar(texto, i);
    if (!entrada) {
      const resto = texto.slice(i, i + 24);
      avisos.push(`AI desconhecido a partir de "${resto}". O trecho não está no dicionário GS1.`);
      break;
    }
    i += entrada.ai.length;
    let valor = "";
    let cortou = false;
    if (entrada.fixo) {
      valor = texto.slice(i, i + entrada.maximo);
      i += valor.length;
      const sep = separador(texto, i, substituto);
      if (sep && sep.pos === i) i += sep.len;
    } else {
      const sep = separador(texto, i, substituto);
      if (sep && sep.pos - i <= entrada.maximo) {
        valor = texto.slice(i, sep.pos);
        i = sep.pos + sep.len;
      } else if (texto.length - i > entrada.maximo) {
        valor = texto.slice(i, i + entrada.maximo);
        i += entrada.maximo;
        cortou = true;
      } else {
        valor = texto.slice(i);
        i = texto.length;
      }
    }
    const campo = campoDe(entrada, entrada.ai, valor, ano);
    campos.push(campo);
    erros.push(...errosDoCampo(campo, ano));
    if (cortou) {
      avisos.push(
        `O AI (${entrada.ai}) atingiu o máximo de ${entrada.maximo} sem separador GS. O que sobrou foi lido em seguida — confira se o separador se perdeu.`,
      );
    }
  }
  return { forma: "elemento", campos, erros, avisos, informes: [] };
}

function parseParenteses(texto: string, ano: number): ParseGs1 {
  const campos: CampoGs1[] = [];
  const erros: string[] = [];
  const avisos: string[] = [];
  let i = 0;
  while (i < texto.length) {
    while (texto[i] === " ") i++;
    if (i >= texto.length) break;
    if (texto[i] !== "(") {
      erros.push(`Trecho fora do formato (AI) a partir de "${texto.slice(i, i + 16)}".`);
      break;
    }
    const fecha = texto.indexOf(")", i);
    if (fecha < 0) {
      erros.push("Há um parêntese sem fechar.");
      break;
    }
    const ai = texto.slice(i + 1, fecha).trim();
    i = fecha + 1;
    while (texto[i] === " ") i++;
    let fim = texto.length;
    for (let j = i; j < texto.length; j++) {
      if (texto[j] !== "(") continue;
      const f2 = texto.indexOf(")", j);
      if (f2 < 0) break;
      const proximo = texto.slice(j + 1, f2).trim();
      if (/^\d{2,4}$/.test(proximo)) {
        fim = j;
        break;
      }
    }
    const valor = texto
      .slice(i, fim)
      .trim()
      .replaceAll(GS, "")
      .replaceAll("<GS>", "")
      .replaceAll("{GS}", "");
    i = fim;
    const entrada = entradaAi(ai) ?? null;
    const campo = campoDe(entrada, ai, valor, ano);
    campos.push(campo);
    if (!entrada) avisos.push(`AI (${ai}) desconhecido. O dicionário GS1 não tem esse código.`);
    else erros.push(...errosDoCampo(campo, ano));
  }
  return { forma: "parenteses", campos, erros, avisos, informes: [] };
}

function pareceLink(texto: string): boolean {
  if (/^https?:\/\//i.test(texto)) return true;
  if (/^id\.gs1\.org\//i.test(texto)) return true;
  return false;
}

function parseLink(texto: string, ano: number): ParseGs1 {
  const erros: string[] = [];
  const avisos: string[] = [];
  const informes: string[] = [];
  const campos: CampoGs1[] = [];
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return { forma: "digital-link", campos, erros: ["O endereço GS1 Digital Link não pôde ser lido."], avisos, informes };
  }
  const partes = url.pathname.split("/").filter(Boolean);
  let i = 0;
  while (i < partes.length && !entradaAi(partes[i])) i++;
  if (i >= partes.length) {
    erros.push("O endereço não tem um AI do GS1 no caminho.");
  }
  for (; i + 1 < partes.length; i += 2) {
    if (!/^\d{2,4}$/.test(partes[i])) break;
    const ai = partes[i];
    let valor = decodeURIComponent(partes[i + 1]);
    const entrada = entradaAi(ai) ?? null;
    if (entrada && (ai === "01" || ai === "02" || ai === "03") && /^\d{8}$|^\d{12}$|^\d{13}$/.test(valor)) {
      const padded = valor.padStart(14, "0");
      informes.push(`GTIN com ${valor.length} dígitos no Digital Link. A conferência usa 14 dígitos: ${padded}.`);
      valor = padded;
    }
    const campo = campoDe(entrada, ai, valor, ano);
    campos.push(campo);
    if (!entrada) avisos.push(`AI (${ai}) desconhecido no Digital Link.`);
    else erros.push(...errosDoCampo(campo, ano));
  }
  url.searchParams.forEach((valorBruto, chave) => {
    if (!/^\d{2,4}$/.test(chave)) return;
    const entrada = entradaAi(chave) ?? null;
    let valor = valorBruto;
    if (entrada && (chave === "01" || chave === "02" || chave === "03") && /^\d{8}$|^\d{12}$|^\d{13}$/.test(valor)) {
      valor = valor.padStart(14, "0");
    }
    const campo = campoDe(entrada, chave, valor, ano);
    campos.push(campo);
    if (!entrada) avisos.push(`AI (${chave}) desconhecido na consulta do Digital Link.`);
    else erros.push(...errosDoCampo(campo, ano));
  });
  const chave = campos[0];
  if (chave?.entrada?.dlpkey.startsWith("dlpkey=")) {
    const alternativas = chave.entrada.dlpkey.slice("dlpkey=".length).split("|");
    const caminho = campos
      .filter((c) => url.pathname.includes(`/${c.ai}/`))
      .slice(1)
      .map((c) => c.ai);
    if (caminho.length) {
      const ok = alternativas.some((alt) => {
        const ordem = alt.split(",").filter(Boolean);
        let cursor = 0;
        for (const ai of caminho) {
          const pos = ordem.indexOf(ai, cursor);
          if (pos < 0) return false;
          cursor = pos + 1;
        }
        return true;
      });
      if (!ok) {
        avisos.push(
          `A ordem dos qualificadores no caminho do Digital Link (${caminho.join(", ")}) não segue o dicionário para o AI (${chave.ai}).`,
        );
      }
    }
  }
  return { forma: "digital-link", campos, erros, avisos, informes };
}

export function parseGs1(texto: string, substituto: string, ano: number): ParseGs1 {
  if (pareceLink(texto)) return parseLink(texto, ano);
  if (/^\s*\(\d{2,4}\)/.test(texto)) return parseParenteses(texto, ano);
  return parseElemento(texto, substituto, ano);
}
