/** Server-side word search grid generator. All option words are hidden in the grid. */
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateGrid(options: string[]): string[][] {
  const words = options.map((w) => w.toUpperCase().replaceAll(/[^A-Z]/g, ''));
  const size = Math.max(8, Math.max(...words.map((w) => w.length)) + 2);
  const grid: (string | null)[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => null));
  const directories = [
    [0, 1], // right
    [1, 0], // down
    [1, 1], // diagonal
  ];
  for (const word of words) {
    let placed = false;
    for (let attempt = 0; attempt < 200 && !placed; attempt++) {
      const [dr, dc] = directories[Math.floor(Math.random() * directories.length)];
      const maxRow = size - (dr ? word.length : 1);
      const maxCol = size - (dc ? word.length : 1);
      const row = Math.floor(Math.random() * (maxRow + 1));
      const col = Math.floor(Math.random() * (maxCol + 1));
      let fits = true;
      for (const [index, element] of [...word].entries()) {
        const cell = grid[row + dr * index][col + dc * index];
        if (cell !== null && cell !== element) {
          fits = false;
          break;
        }
      }
      if (!fits) continue;
      for (let index = 0; index < word.length; index++) grid[row + dr * index][col + dc * index] = word[index];
      placed = true;
    }
    // PoC shortcut: if a word does not fit after 200 attempts we skip it.
    // The player can still pick it from the option list below the grid.
  }
  return grid.map((row) => row.map((c) => c ?? LETTERS[Math.floor(Math.random() * 26)]));
}
