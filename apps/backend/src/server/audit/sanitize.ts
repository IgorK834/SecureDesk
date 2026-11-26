const INVISIBLE = /[\p{Cc}\p{Cs}\p{Default_Ignorable_Code_Point}\u2028\u2029]/u;

/** Escape invisible characters within a UTF-16 length budget, keeping each escape intact. */
export function sanitizeForLog(text: string, maxLength: number): string {
  let output = '';
  for (const character of text) {
    const visible = INVISIBLE.test(character)
      ? character
          .split('')
          .map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`)
          .join('')
      : character;
    if (output.length + visible.length > maxLength) break;
    output += visible;
  }
  return output;
}
