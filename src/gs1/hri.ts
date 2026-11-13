import type { CampoVisivel } from "../udi/tipos";

/**
 * HRI preferido da GS1 General Specifications v15, seção 4.14:
 * AI entre parênteses e o dado como está no código, sem reformatar data.
 * O AI (8200) não entra no HRI (regra 9).
 * O AI (7004) não é exigido no HRI (§4.14.1, nota da potência ativa).
 */
export function hriGs1(campos: CampoVisivel[]): { texto: string; notas: string[] } {
  const notas: string[] = [];
  const partes: string[] = [];
  let gtin = "";
  for (const campo of campos) {
    if (campo.ai === "01") gtin = campo.valor.padStart(14, "0");
    if (campo.ai === "8200") {
      notas.push(
        "O AI (8200) não entra no HRI. Se a URL for impressa em texto não-HRI, a forma da norma é http://brandownerassignedURL.com/" +
          (gtin || "GTIN14") +
          " — brandownerassignedURL.com é o exemplo da GS1, não um site deste leitor.",
      );
      continue;
    }
    if (campo.ai === "7004") {
      notas.push(
        "O AI (7004), potência ativa, não precisa aparecer no HRI. A impressão é controlada por regulamento (GS1 General Specifications v15, §4.14.1).",
      );
      continue;
    }
    partes.push(`(${campo.ai})${campo.valor}`);
  }
  return { texto: partes.join(""), notas };
}
