/**
 * Século do linter yymmd0 do GS1 Barcode Syntax Dictionary:
 * se AA − anoAtual(2 dígitos) >= 51 → 19AA;
 * senão, se a diferença > −50 → 20AA;
 * senão → 21AA.
 */
export function anoGs1(aa: number, anoCorrente: number): number {
  const atual = anoCorrente % 100;
  const delta = aa - atual;
  if (delta >= 51) return 1900 + aa;
  if (delta > -50) return 2000 + aa;
  return 2100 + aa;
}

export function bissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

export function diasNoMes(ano: number, mes: number): number {
  const tabela = [0, 31, bissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return tabela[mes] ?? 0;
}

export function isoDe(ano: number, mes: number, dia: number): string {
  const m = String(mes).padStart(2, "0");
  const d = String(dia).padStart(2, "0");
  return `${ano}-${m}-${d}`;
}

export function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export type DataLida =
  | { ok: true; iso: string; diaZero: boolean }
  | { ok: false; erro: string };

export function lerAammdd(
  valor: string,
  permiteDiaZero: boolean,
  anoCorrente: number,
): DataLida {
  if (!/^\d{6}$/.test(valor)) {
    return { ok: false, erro: "a data precisa ter 6 dígitos (AAMMDD)" };
  }
  const aa = Number(valor.slice(0, 2));
  const mm = Number(valor.slice(2, 4));
  const dd = Number(valor.slice(4, 6));
  if (mm < 1 || mm > 12) return { ok: false, erro: "mês inválido" };
  const ano = anoGs1(aa, anoCorrente);
  if (dd === 0) {
    if (!permiteDiaZero) return { ok: false, erro: "dia 00 não é aceito neste AI" };
    return { ok: true, iso: isoDe(ano, mm, diasNoMes(ano, mm)), diaZero: true };
  }
  if (dd < 1 || dd > diasNoMes(ano, mm)) return { ok: false, erro: "dia inválido" };
  return { ok: true, iso: isoDe(ano, mm, dd), diaZero: false };
}

export function lerAaaammdd(valor: string): DataLida {
  if (!/^\d{8}$/.test(valor)) {
    return { ok: false, erro: "a data precisa ter 8 dígitos (AAAAMMDD)" };
  }
  const ano = Number(valor.slice(0, 4));
  const mm = Number(valor.slice(4, 6));
  const dd = Number(valor.slice(6, 8));
  if (mm < 1 || mm > 12) return { ok: false, erro: "mês inválido" };
  if (dd < 1 || dd > diasNoMes(ano, mm)) return { ok: false, erro: "dia inválido" };
  return { ok: true, iso: isoDe(ano, mm, dd), diaZero: false };
}

/** Dia juliano 001 = 1º de janeiro, no calendário gregoriano. */
export function lerJuliana(ano: number, jjj: number): DataLida {
  const limite = bissexto(ano) ? 366 : 365;
  if (jjj < 1 || jjj > limite) return { ok: false, erro: "dia juliano inválido" };
  const marco = new Date(Date.UTC(ano, 0, jjj));
  return {
    ok: true,
    iso: isoDe(marco.getUTCFullYear(), marco.getUTCMonth() + 1, marco.getUTCDate()),
    diaZero: false,
  };
}
