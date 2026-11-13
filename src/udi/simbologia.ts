const GS1 = new Set(["]d2", "]C1", "]Q3", "]e0"]);

export function separarSimbologia(bruto: string): {
  simbologia: string | null;
  texto: string;
  gs1: boolean;
} {
  const semBom = bruto.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const hibcc = /^\s*[+$]/.test(semBom);
  const limpo = hibcc ? semBom.trimStart().replace(/[^\S\n]+$/g, (fim) => (semBom.endsWith(" ") ? " " : fim.trim())) : semBom.trim();
  const m = /^\][A-Za-z]\d/.exec(limpo);
  if (!m) return { simbologia: null, texto: limpo, gs1: false };
  return { simbologia: m[0], texto: limpo.slice(m[0].length), gs1: GS1.has(m[0]) };
}
