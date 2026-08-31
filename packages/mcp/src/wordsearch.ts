/** Server-side word search grid generator. All option words are hidden in the grid. */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateGrid(options: string[]): string[][] {
  const words = options.map((w) => w.toUpperCase().replaceAll(/[^A-Z]/g, ''));
  const size = Math.max(8, words.length, Math.max(...words.map((w) => w.length)) + 2);
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => null));
  // A dedicated randomized row per word guarantees that every advertised option is present.
  for (const [row, word] of words.entries()) {
    const col = Math.floor(Math.random() * (size - word.length + 1));
    for (let index = 0; index < word.length; index++) grid[row][col + index] = word[index];
  }
  return grid.map((row) => row.map((c) => c ?? LETTERS[Math.floor(Math.random() * 26)]));
}
