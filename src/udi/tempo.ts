import type { Dia } from "./tipos";

export function hojeSaoPaulo(agora = new Date()): Dia {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const pegar = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  return { ano: pegar("year"), mes: pegar("month"), dia: pegar("day") };
}

export function dataHoraSaoPaulo(agora = new Date()): string {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return fmt.format(agora).replace("T", " ");
}

export function isoDia(dia: Dia): string {
  return `${dia.ano}-${String(dia.mes).padStart(2, "0")}-${String(dia.dia).padStart(2, "0")}`;
}
