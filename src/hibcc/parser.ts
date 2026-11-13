import type { CampoVisivel } from "../udi/tipos";
import { lerDataHibcc } from "./datas";
import { caractereMod43 } from "./mod43";

export type Qualificador = {
  id: string;
  digitos: number;
  formato: string | null;
  depois: "lote" | "serie" | null;
  legado: boolean;
};

/** Tabela FDA v1.4, na ordem em que o prefixo mais longo precisa ser testado. */
export const QUALIFICADORES: Qualificador[] = [
  { id: "$$+7", digitos: 0, formato: null, depois: "serie", legado: false },
  { id: "$$+6", digitos: 7, formato: "YYJJJHH", depois: "serie", legado: false },
  { id: "$$+5", digitos: 5, formato: "YYJJJ", depois: "serie", legado: false },
  { id: "$$+4", digitos: 8, formato: "YYMMDDHH", depois: "serie", legado: false },
  { id: "$$+3", digitos: 6, formato: "YYMMDD", depois: "serie", legado: false },
  { id: "$$+2", digitos: 6, formato: "MMDDYY", depois: "serie", legado: false },
  { id: "$$+", digitos: 4, formato: "MMYY", depois: "serie", legado: false },
  { id: "$$7", digitos: 0, formato: null, depois: "lote", legado: false },
  { id: "$$6", digitos: 7, formato: "YYJJJHH", depois: "lote", legado: false },
  { id: "$$5", digitos: 5, formato: "YYJJJ", depois: "lote", legado: false },
  { id: "$$4", digitos: 8, formato: "YYMMDDHH", depois: "lote", legado: false },
  { id: "$$3", digitos: 6, formato: "YYMMDD", depois: "lote", legado: false },
  { id: "$$2", digitos: 6, formato: "MMDDYY", depois: "lote", legado: false },
  { id: "$$", digitos: 4, formato: "MMYY", depois: "lote", legado: false },
  { id: "$+", digitos: 0, formato: null, depois: "serie", legado: true },
  { id: "$", digitos: 0, formato: null, depois: "lote", legado: true },
];

export type ParseHibcc = {
  di: string | null;
  campos: CampoVisivel[];
  erros: string[];
  avisos: string[];
  informes: string[];
  validades: { iso: string; origem: string }[];
  verificador: { encontrado: string; esperado: string | null; valido: boolean };
};

const LIMITE_VARIAVEL = 18;

function lerVariavel(texto: string, inicio: number, nome: string, erros: string[]): { valor: string; fim: number } {
  const barra = texto.indexOf("/", inicio);
  const fimBruto = barra >= 0 ? barra : texto.length;
  let fim = fimBruto;
  if (fimBruto - inicio > LIMITE_VARIAVEL) {
    erros.push(`O ${nome} passa de ${LIMITE_VARIAVEL} caracteres, que é o tamanho de banco publicado pela FDA.`);
    fim = inicio + LIMITE_VARIAVEL;
  }
  const valor = texto.slice(inicio, fim);
  if (!valor) erros.push(`O ${nome} está vazio.`);
  return { valor, fim: fimBruto > fim ? fim : fimBruto };
}

export function parseHibcc(texto: string): ParseHibcc {
  const erros: string[] = [];
  const avisos: string[] = [];
  const informes: string[] = [];
  const campos: CampoVisivel[] = [];
  const validades: { iso: string; origem: string }[] = [];
  if (texto.length < 2) {
    return {
      di: null,
      campos,
      erros: ["Código HIBCC curto demais."],
      avisos,
      informes,
      validades,
      verificador: { encontrado: "", esperado: null, valido: false },
    };
  }
  const encontrado = texto.slice(-1);
  const corpo = texto.slice(0, -1);
  let esperado: string | null = null;
  let valido = false;
  try {
    esperado = caractereMod43(corpo);
    valido = esperado === encontrado;
  } catch (e) {
    erros.push(e instanceof Error ? e.message : "Caractere fora do conjunto Mod 43.");
  }
  if (esperado != null && !valido) {
    erros.push(
      `Dígito Mod 43 divergente. Calculado: ${esperado === " " ? "espaço" : esperado}. No código: ${encontrado === " " ? "espaço" : encontrado}. A conta é a do apêndice B do ANSI/HIBC 2.5, com o "+" incluído.`,
    );
  }
  if (valido) {
    informes.push(
      `Dígito Mod 43 confere (${encontrado === " " ? "espaço" : encontrado}). A HIBCC pede para não gravar esse caractere como se fosse dado.`,
    );
  }
  if (texto.length > 87) {
    avisos.push("O texto passa de 87 caracteres, máximo da UDI-base HIBCC na tabela FDA v1.4.");
  }

  let di: string | null = null;
  let secundario = "";
  if (corpo.startsWith("+")) {
    const semMais = corpo.slice(1);
    const marca = /\/(?:\$\$\+\d|\$\$\+|\$\+|\$\$\d|\$\$|\$|16D|14D|S)/.exec(semMais);
    if (!marca) {
      di = semMais;
    } else {
      di = semMais.slice(0, marca.index);
      secundario = semMais.slice(marca.index + 1);
    }
    if (di.length < 6 || di.length > 23) {
      avisos.push(
        `O DI HIBCC tem ${di.length} caracteres. A tabela FDA v1.4 publica de 6 a 23 no banco (7 a 24 no texto legível, já com o +).`,
      );
    }
    campos.push({ ai: "+", rotulo: "DI HIBCC", valor: di, detalhe: "" });
  } else {
    secundario = corpo;
    informes.push("Código secundário HIBCC, sem o DI primário que começa com +.");
  }

  if (secundario) {
    const qual = QUALIFICADORES.find((q) => secundario.startsWith(q.id));
    if (!qual) {
      erros.push(`Delimitador secundário não reconhecido em "${secundario.slice(0, 8)}".`);
    } else {
      if (qual.legado) {
        avisos.push(
          `O delimitador ${qual.id} está na FDA v1.4 só para compatibilidade com versões anteriores.`,
        );
      }
      let cursor = qual.id.length;
      if (qual.formato) {
        const digitos = secundario.slice(cursor, cursor + qual.digitos);
        cursor += qual.digitos;
        const lida = lerDataHibcc(qual.formato, digitos);
        if (!lida.ok) erros.push(`Data do ${qual.id} inválida: ${lida.erro}.`);
        else {
          campos.push({
            ai: qual.id,
            rotulo: `Data (${qual.id}, ${qual.formato})`,
            valor: digitos,
            detalhe: lida.data.texto,
          });
          validades.push({ iso: lida.data.iso, origem: `HIBCC ${qual.id}` });
          if (lida.data.seculoAssumido) {
            informes.push(
              "Ano HIBCC com 2 dígitos: a tabela FDA v1.4 não define o século. Este leitor mostra 20AA.",
            );
          }
        }
      }
      if (qual.depois) {
        const nome = qual.depois === "lote" ? "lote" : "série";
        const lido = lerVariavel(secundario, cursor, nome, erros);
        cursor = lido.fim;
        campos.push({
          ai: qual.id,
          rotulo: qual.depois === "lote" ? `Lote (${qual.id})` : `Série (${qual.id})`,
          valor: lido.valor,
          detalhe: "",
        });
      }
      while (cursor < secundario.length) {
        if (!secundario.startsWith("/", cursor)) {
          erros.push(`Sobra depois do campo secundário: "${secundario.slice(cursor, cursor + 16)}".`);
          break;
        }
        if (secundario.startsWith("/16D", cursor) || secundario.startsWith("/14D", cursor)) {
          const id = secundario.startsWith("/16D", cursor) ? "/16D" : "/14D";
          cursor += id.length;
          const digitos = secundario.slice(cursor, cursor + 8);
          cursor += digitos.length;
          const lida = lerDataHibcc("YYYYMMDD", digitos);
          const rotulo = id === "/16D" ? "Fabricação (/16D)" : "Validade (/14D)";
          if (!lida.ok) erros.push(`${rotulo}: ${lida.erro}.`);
          campos.push({
            ai: id,
            rotulo,
            valor: digitos,
            detalhe: lida.ok ? lida.data.texto : "",
          });
          if (lida.ok && id === "/14D") validades.push({ iso: lida.data.iso, origem: "HIBCC /14D" });
          continue;
        }
        if (secundario.startsWith("/S", cursor)) {
          cursor += 2;
          const lido = lerVariavel(secundario, cursor, "série suplementar", erros);
          cursor = lido.fim;
          campos.push({ ai: "/S", rotulo: "Série suplementar (/S)", valor: lido.valor, detalhe: "" });
          continue;
        }
        erros.push(`Suplemento HIBCC não reconhecido em "${secundario.slice(cursor, cursor + 12)}".`);
        break;
      }
    }
  }

  const unicos = [...new Set(informes)];
  return { di, campos, erros, avisos, informes: unicos, validades, verificador: { encontrado, esperado, valido } };
}
