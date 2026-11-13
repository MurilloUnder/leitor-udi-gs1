/**
 * HIBC LIC Mod 43, apêndice B do ANSI/HIBC 2.5 (2015).
 * O "+" entra na soma (valor 41). O resultado é o resto da soma módulo 43.
 */
export const CONJUNTO_MOD43 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";

export function caractereMod43(mensagem: string): string {
  let soma = 0;
  for (const ch of mensagem) {
    const valor = CONJUNTO_MOD43.indexOf(ch);
    if (valor < 0) {
      throw new Error(`Caractere fora do conjunto Mod 43: ${ch}`);
    }
    soma += valor;
  }
  return CONJUNTO_MOD43[soma % 43];
}
