import { dataBr, diasNoMes, isoDe, lerJuliana, type DataLida } from "../gs1/dates";

export type DataHibcc = {
  iso: string;
  texto: string;
  hora: string | null;
  seculoAssumido: boolean;
};

function ano20(aa: number): number {
  return 2000 + aa;
}

function calendario(ano: number, mes: number, dia: number): DataLida {
  if (mes < 1 || mes > 12) return { ok: false, erro: "mês inválido" };
  if (dia < 1 || dia > diasNoMes(ano, mes)) return { ok: false, erro: "dia inválido" };
  return { ok: true, iso: isoDe(ano, mes, dia), diaZero: false };
}

function fimDoMes(ano: number, mes: number): string {
  return isoDe(ano, mes, diasNoMes(ano, mes));
}

export function lerDataHibcc(formato: string, digitos: string): { ok: true; data: DataHibcc } | { ok: false; erro: string } {
  if (!/^\d+$/.test(digitos) || digitos.length !== formato.replace(/[^A-Z]/g, "").length && digitos.length !== expectedLen(formato)) {
    return { ok: false, erro: `data "${digitos}" não tem o tamanho do formato ${formato}` };
  }
  if (digitos.length !== expectedLen(formato)) {
    return { ok: false, erro: `data "${digitos}" não tem ${expectedLen(formato)} dígitos (${formato})` };
  }
  const n = (ini: number, fim: number) => Number(digitos.slice(ini, fim));
  if (formato === "MMYY") {
    const mes = n(0, 2);
    const ano = ano20(n(2, 4));
    if (mes < 1 || mes > 12) return { ok: false, erro: "mês inválido" };
    const iso = fimDoMes(ano, mes);
    return {
      ok: true,
      data: {
        iso,
        texto: `${dataBr(iso)} (só mês e ano ${digitos}; a FDA não define o dia — o alerta usa o fim do mês)`,
        hora: null,
        seculoAssumido: true,
      },
    };
  }
  if (formato === "MMDDYY") {
    const lida = calendario(ano20(n(4, 6)), n(0, 2), n(2, 4));
    if (!lida.ok) return { ok: false, erro: lida.erro };
    return { ok: true, data: { iso: lida.iso, texto: dataBr(lida.iso), hora: null, seculoAssumido: true } };
  }
  if (formato === "YYMMDD") {
    const lida = calendario(ano20(n(0, 2)), n(2, 4), n(4, 6));
    if (!lida.ok) return { ok: false, erro: lida.erro };
    return { ok: true, data: { iso: lida.iso, texto: dataBr(lida.iso), hora: null, seculoAssumido: true } };
  }
  if (formato === "YYMMDDHH") {
    const lida = calendario(ano20(n(0, 2)), n(2, 4), n(4, 6));
    if (!lida.ok) return { ok: false, erro: lida.erro };
    const hora = n(6, 8);
    if (hora > 23) return { ok: false, erro: "hora inválida" };
    return {
      ok: true,
      data: {
        iso: lida.iso,
        texto: `${dataBr(lida.iso)} ${String(hora).padStart(2, "0")}h`,
        hora: String(hora).padStart(2, "0"),
        seculoAssumido: true,
      },
    };
  }
  if (formato === "YYJJJ" || formato === "YYJJJHH") {
    const ano = ano20(n(0, 2));
    const juliana = lerJuliana(ano, n(2, 5));
    if (!juliana.ok) return { ok: false, erro: juliana.erro };
    let hora: string | null = null;
    if (formato === "YYJJJHH") {
      const h = n(5, 7);
      if (h > 23) return { ok: false, erro: "hora inválida" };
      hora = String(h).padStart(2, "0");
    }
    return {
      ok: true,
      data: {
        iso: juliana.iso,
        texto: dataBr(juliana.iso) + (hora ? ` ${hora}h` : "") + ` (juliana ${digitos.slice(0, 5)})`,
        hora,
        seculoAssumido: true,
      },
    };
  }
  if (formato === "YYYYMMDD") {
    const lida = calendario(n(0, 4), n(4, 6), n(6, 8));
    if (!lida.ok) return { ok: false, erro: lida.erro };
    return { ok: true, data: { iso: lida.iso, texto: dataBr(lida.iso), hora: null, seculoAssumido: false } };
  }
  return { ok: false, erro: `formato ${formato} não está na tabela` };
}

function expectedLen(formato: string): number {
  return { MMYY: 4, MMDDYY: 6, YYMMDD: 6, YYMMDDHH: 8, YYJJJ: 5, YYJJJHH: 7, YYYYMMDD: 8 }[formato] ?? 0;
}

