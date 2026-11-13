/** Conjunto 82 do GS1, como em gs1_lint_cset82. */
export const CSET82 =
  "!\"%&'()*+,-./0123456789:;<=>?ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

/** Conjunto 39 do GS1: # - / , dígitos e A–Z. */
export const CSET39 = "#-/0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const BASE64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export type TipoDado = "N" | "X" | "Y" | "Z";

export function conjunto(tipo: TipoDado): string {
  if (tipo === "N") return "0123456789";
  if (tipo === "X") return CSET82;
  if (tipo === "Y") return CSET39;
  return BASE64URL;
}

export function nomeConjunto(tipo: TipoDado): string {
  if (tipo === "N") return "numérico (0–9)";
  if (tipo === "X") return "CSET 82";
  if (tipo === "Y") return "CSET 39";
  return "base64url";
}
