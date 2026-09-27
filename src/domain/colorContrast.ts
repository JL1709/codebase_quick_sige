const DARK_TEXT_COLOR = "#07100d";
const LIGHT_TEXT_COLOR = "#ffffff";

function parseHexColor(color: string): [number, number, number] | null {
  const normalized = color.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16)) as [number, number, number];
}

function linearizeChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string): number | null {
  const channels = parseHexColor(color);
  if (!channels) return null;
  const [red, green, blue] = channels.map(linearizeChannel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(firstColor: string, secondColor: string): number {
  const firstLuminance = relativeLuminance(firstColor);
  const secondLuminance = relativeLuminance(secondColor);
  if (firstLuminance === null || secondLuminance === null) return 1;
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function readableTextColor(backgroundColor: string): string {
  return contrastRatio(backgroundColor, DARK_TEXT_COLOR) >= contrastRatio(backgroundColor, LIGHT_TEXT_COLOR)
    ? DARK_TEXT_COLOR
    : LIGHT_TEXT_COLOR;
}
