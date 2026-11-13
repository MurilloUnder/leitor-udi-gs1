/**
 * ISO/IEC 7064 Mod 37-2, método recursivo do ST-001 (ICCBBA), apêndice A.
 * O caractere K de teclado não faz parte do código de barras.
 */
const ISO = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ*";

export function valorMod372(dados: string): number {
  let soma = 0;
  for (const ch of dados) {
    const valor = ISO.indexOf(ch);
    if (valor < 0) throw new Error(`Caractere fora do Mod 37-2: ${ch}`);
    soma = ((soma + valor) * 2) % 37;
  }
  return (38 - soma) % 37;
}

export function caractereK(dados: string): string {
  return ISO[valorMod372(dados)];
}
