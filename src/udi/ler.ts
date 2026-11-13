import { hriGs1 } from "../gs1/hri";
import { parseGs1 } from "../gs1/parser";
import { parseHibcc } from "../hibcc/parser";
import { parseIsbt } from "../isbt/parser";
import { dataBr } from "../gs1/dates";
import { separarSimbologia } from "./simbologia";
import { hojeSaoPaulo, isoDia } from "./tempo";
import type { CampoVisivel, OpcoesLeitura, Resultado, Validade } from "./tipos";

function base(
  bruto: string,
  simbologia: string | null,
  agencia: Resultado["agencia"],
  agenciaNome: string,
): Resultado {
  return {
    agencia,
    agenciaNome,
    bruto,
    simbologia,
    di: null,
    diRotulo: "DI",
    campos: [],
    erros: [],
    avisos: [],
    informes: [],
    validades: [],
    vencido: null,
    hri: null,
    hriNotas: [],
  };
}

function aplicarValidade(resultado: Resultado, hojeIso: string): void {
  const vencidas = resultado.validades.filter((v) => v.iso < hojeIso);
  if (vencidas.length === 0) return;
  const texto = vencidas
    .map((v) => `${dataBr(v.iso)} (${v.origem})`)
    .join("; ");
  resultado.vencido = `Validade vencida: ${texto}. Hoje, no fuso America/Sao_Paulo, é ${dataBr(hojeIso)}.`;
}

function avisosGs1(campos: CampoVisivel[], avisos: string[]): void {
  const gtin = campos.find((c) => c.ai === "01");
  if (gtin && gtin.valor.startsWith("9")) {
    avisos.push(
      "O GTIN-14 começa com o indicador 9 (item de medida variável, GS1 General Specifications 2.1.7). Não é o GTIN de um item de medida fixa.",
    );
  }
  if (campos.some((c) => c.ai === "00")) {
    avisos.push("O AI (00) é um SSCC, código de unidade logística. Não é um UDI de dispositivo médico.");
  }
  const soma = campos
    .filter((c) => ["01", "11", "17", "10", "21"].includes(c.ai))
    .reduce((total, c) => total + c.ai.length + c.valor.length, 0);
  if (soma > 76) {
    avisos.push(
      "A soma de AI e dado de (01), (11), (17), (10) e (21) passa de 76, que é o máximo da UDI-base GS1 na tabela FDA v1.4. Os parênteses do HRI não entram nessa conta.",
    );
  }
}

export function lerUdi(bruto: string, opcoes: OpcoesLeitura = {}): Resultado {
  const sep = separarSimbologia(bruto);
  const hoje = opcoes.hoje ?? hojeSaoPaulo();
  const ano = opcoes.anoCorrente ?? hoje.ano;
  const hojeIso = isoDia(hoje);
  const texto = sep.texto;

  if (texto.startsWith("+") || texto.startsWith("$")) {
    const lido = parseHibcc(texto);
    const resultado = base(bruto, sep.simbologia, "HIBCC", "HIBCC");
    resultado.di = lido.di;
    resultado.diRotulo = "DI HIBCC";
    resultado.campos = lido.campos;
    resultado.erros = lido.erros;
    resultado.avisos = lido.avisos;
    resultado.informes = lido.informes;
    resultado.validades = lido.validades;
    if (sep.gs1) {
      resultado.avisos.unshift(
        `O prefixo ${sep.simbologia} é de GS1, mas o dado começa com ${texto[0]}, que a tabela FDA usa na HIBCC. A leitura seguiu o dado.`,
      );
    }
    aplicarValidade(resultado, hojeIso);
    return resultado;
  }

  if (texto.startsWith("=") || texto.startsWith("&")) {
    const lido = parseIsbt(texto);
    const resultado = base(bruto, sep.simbologia, "ICCBBA", "ICCBBA — ISBT 128");
    resultado.di = lido.di;
    resultado.diRotulo = lido.bolsa ? "DI de bolsa de sangue" : "DI ISBT 128";
    resultado.campos = lido.campos;
    resultado.erros = lido.erros;
    resultado.avisos = lido.avisos;
    resultado.informes = lido.informes;
    resultado.validades = lido.validades;
    aplicarValidade(resultado, hojeIso);
    return resultado;
  }

  const gs1 =
    sep.gs1 ||
    /^\s*\(\d{2,4}\)/.test(texto) ||
    /^https?:\/\//i.test(texto) ||
    /^id\.gs1\.org\//i.test(texto) ||
    /^\d{2}/.test(texto);
  if (!gs1) {
    const resultado = base(bruto, sep.simbologia, "DESCONHECIDA", "Não reconhecida");
    resultado.erros.push(
      "Não reconheci a agência. GS1 começa com AI, (01) ou ]d2/]C1/]Q3/]e0. HIBCC começa com +. ISBT 128 começa com = ou &.",
    );
    return resultado;
  }

  const lido = parseGs1(texto, opcoes.substitutoGs ?? "", ano);
  const resultado = base(bruto, sep.simbologia, "GS1", "GS1");
  resultado.campos = lido.campos;
  resultado.erros = lido.erros;
  resultado.avisos = lido.avisos;
  resultado.informes = lido.informes;
  const gtin = lido.campos.find((c) => c.ai === "01");
  resultado.di = gtin?.valor ?? null;
  resultado.diRotulo = "GTIN (01)";
  const validades: Validade[] = [];
  for (const campo of lido.campos) {
    if (campo.ai === "17" && campo.iso) validades.push({ iso: campo.iso, origem: "GS1 (17)" });
  }
  resultado.validades = validades;
  avisosGs1(resultado.campos, resultado.avisos);
  const hri = hriGs1(resultado.campos);
  resultado.hri = hri.texto;
  resultado.hriNotas = hri.notas;
  if (lido.forma === "digital-link") {
    resultado.informes.unshift("Lido como GS1 Digital Link.");
  }
  aplicarValidade(resultado, hojeIso);
  return resultado;
}
