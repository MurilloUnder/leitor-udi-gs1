import { dataBr, lerJuliana } from "../gs1/dates";
import type { CampoVisivel } from "../udi/tipos";
import { caractereK, valorMod372 } from "./mod372";

type Estrutura = {
  id: string;
  rotulo: string;
  tamanho: number;
  tipo: "texto" | "yyyjjj" | "din";
};

const ESTRUTURAS: Estrutura[] = [
  { id: "=/", rotulo: "DI ISBT 128", tamanho: 16, tipo: "texto" },
  { id: "=,", rotulo: "Série", tamanho: 6, tipo: "texto" },
  { id: "=>", rotulo: "Validade", tamanho: 6, tipo: "yyyjjj" },
  { id: "=}", rotulo: "Fabricação", tamanho: 6, tipo: "yyyjjj" },
  { id: "=)", rotulo: "DI de bolsa de sangue", tamanho: 10, tipo: "texto" },
  { id: "&,1", rotulo: "Lote MPHO", tamanho: 18, tipo: "texto" },
  { id: "&)", rotulo: "Lote de bolsa de sangue", tamanho: 10, tipo: "texto" },
  { id: "=", rotulo: "Código de identificação distinta (doação)", tamanho: 15, tipo: "din" },
];

export type ParseIsbt = {
  di: string | null;
  bolsa: boolean;
  campos: CampoVisivel[];
  erros: string[];
  avisos: string[];
  informes: string[];
  validades: { iso: string; origem: string }[];
};

function dataJulian(digitos: string): { iso: string; texto: string } | { erro: string } {
  if (!/^\d{6}$/.test(digitos)) return { erro: "a data precisa ter 6 dígitos (AAAJJJ)" };
  const ano = 2000 + Number(digitos.slice(0, 3));
  const lida = lerJuliana(ano, Number(digitos.slice(3)));
  if (!lida.ok) return { erro: lida.erro };
  return { iso: lida.iso, texto: `${dataBr(lida.iso)} (juliana ${digitos})` };
}

export function parseIsbt(texto: string): ParseIsbt {
  const campos: CampoVisivel[] = [];
  const erros: string[] = [];
  const avisos: string[] = [];
  const informes: string[] = [];
  const validades: { iso: string; origem: string }[] = [];
  let i = 0;
  let viuData = false;
  while (i < texto.length) {
    const est = ESTRUTURAS.find((item) => texto.startsWith(item.id, i));
    if (!est) {
      erros.push(`Trecho ISBT 128 não reconhecido a partir de "${texto.slice(i, i + 12)}".`);
      break;
    }
    i += est.id.length;
    const valor = texto.slice(i, i + est.tamanho);
    i += valor.length;
    if (valor.length < est.tamanho) {
      erros.push(`${est.rotulo} (${est.id}) está curto: ${valor.length} de ${est.tamanho}.`);
    }
    let detalhe = "";
    if (est.tipo === "yyyjjj") {
      const lida = dataJulian(valor);
      if ("erro" in lida) erros.push(`${est.rotulo}: ${lida.erro}.`);
      else {
        detalhe = lida.texto;
        if (est.id === "=>") validades.push({ iso: lida.iso, origem: "ISBT 128 =>" });
        viuData = true;
      }
    }
    if (est.tipo === "din" && valor.length === 15) {
      const din = valor.slice(0, 13);
      const bandeiras = valor.slice(13);
      detalhe = `DIN ${din}; bandeiras ${bandeiras}`;
      if (!/^[A-Z1-9]\d{12}$/.test(din)) {
        informes.push(
          "O DIN não está no formato de 13 caracteres do ST-001 (letra ou 1–9 e depois só dígitos). O K abaixo pode não se aplicar.",
        );
      }
      try {
        const k = caractereK(din);
        const tipo3 = String(60 + valorMod372(din)).padStart(2, "0");
        informes.push(
          `Caractere K de teclado (ISO/IEC 7064 Mod 37-2), calculado sobre os 13 caracteres do DIN, sem as bandeiras: ${k}. Ele não faz parte do código de barras (ST-001, §7.5).`,
        );
        if (bandeiras === "00") {
          informes.push("Bandeiras do DIN: 00.");
        } else if (bandeiras === tipo3) {
          informes.push(`Bandeiras ${bandeiras} conferem com o tipo 3 do ST-001 (60 + o valor do K).`);
        } else {
          informes.push(
            `Bandeiras do DIN: ${bandeiras}. A tabela FDA não define o significado; bandeiras locais não são validadas aqui.`,
          );
        }
      } catch (e) {
        erros.push(e instanceof Error ? e.message : "Falha no Mod 37-2.");
      }
    }
    campos.push({ ai: est.id, rotulo: `${est.rotulo} (${est.id})`, valor, detalhe });
  }
  if (viuData) {
    informes.push(
      "Ano juliano de 3 dígitos (AAA): a tabela FDA não descreve o século. Este leitor usa 2000+AAA, então 014 é 2014.",
    );
  }
  const bolsa = campos.some((c) => c.ai === "=)" || c.ai === "&)");
  const hctp = campos.some((c) => c.ai === "=/" || c.ai === "=," || c.ai === "=" || c.ai === "=>" || c.ai === "=}" || c.ai === "&,1");
  if (bolsa && !hctp && texto.length > 24) {
    avisos.push("O texto passa de 24 caracteres, máximo da UDI-base de bolsa de sangue na tabela FDA v1.4.");
  }
  if (hctp && texto.length > 79) {
    avisos.push("O texto passa de 79 caracteres, máximo da UDI-base HCT/P na tabela FDA v1.4.");
  }
  const diCampo = campos.find((c) => c.ai === "=/") ?? campos.find((c) => c.ai === "=)");
  return {
    di: diCampo?.valor ?? null,
    bolsa,
    campos,
    erros,
    avisos,
    informes,
    validades,
  };
}
