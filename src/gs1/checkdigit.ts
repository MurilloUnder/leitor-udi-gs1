/** Dígito GS1 módulo 10. O argumento é o dado sem o dígito. */
export function digitoGs1(semDigito: string): number {
  let soma = 0;
  const invertido = [...semDigito];
  invertido.reverse();
  for (let i = 0; i < invertido.length; i++) {
    soma += Number(invertido[i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (soma % 10)) % 10;
}

export function digitoGs1Confere(completo: string): boolean {
  if (!/^\d{2,}$/.test(completo)) return false;
  return digitoGs1(completo.slice(0, -1)) === Number(completo.slice(-1));
}
