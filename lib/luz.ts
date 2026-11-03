/* Sugestão de quantidade de luminárias por área (usada na tela de pontos). */
export function luzCount(c: number, l: number): number {
  const area = c * l;
  if (area <= 6) return 1;
  if (area <= 20) return 2;
  return 3;
}
