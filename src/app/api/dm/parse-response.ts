// ==========================================
// Simple, robust parser for DM responses
// Format: free narrative + [OPCIONES] block + [INTENCIONES] block
// ==========================================

export interface ParsedDMResponse {
  narrative: string;   // Main story text (clean, no tags)
  options: string[];   // 5 suggested player actions
  intentions: Array<Record<string, unknown>>;
}

export function parseDMResponse(raw: string): ParsedDMResponse {
  let text = raw.trim();

  // --- Extract [INTENCIONES] block ---
  let intentions: Array<Record<string, unknown>> = [];
  const intentBlock = text.match(/\[INTENCIONES\]([\s\S]*?)\[\/INTENCIONES\]/i);
  if (intentBlock) {
    try {
      const jsonStr = intentBlock[1].trim();
      const parsed = JSON.parse(jsonStr) as { intentions?: Array<Record<string, unknown>> };
      intentions = Array.isArray(parsed.intentions) ? parsed.intentions : [];
    } catch {
      intentions = [];
    }
    text = text.replace(/\[INTENCIONES\][\s\S]*?\[\/INTENCIONES\]/i, '').trim();
  }

  // --- Extract [OPCIONES] block ---
  let options: string[] = [];
  const optBlock = text.match(/\[OPCIONES\]([\s\S]*?)\[\/OPCIONES\]/i);
  if (optBlock) {
    options = optBlock[1]
      .split('\n')
      .map(l => l.trim())
      .filter(l => /^[1-5][.)]\s+/.test(l))
      .map(l => l.replace(/^[1-5][.)]\s+/, ''));
    text = text.replace(/\[OPCIONES\][\s\S]*?\[\/OPCIONES\]/i, '').trim();
  }

  // --- Fallback: if model ignored tags, try to detect numbered list at end ---
  if (options.length === 0) {
    const lines = text.split('\n');
    const optionLines: string[] = [];
    const nonOptionLines: string[] = [];
    let foundOptions = false;
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i].trim();
      if (/^\*?\s*[Oo]pci[oó]n\s*[1-5][:.)]/i.test(l) || /^\*?\s*[1-5][.)]\s+\S/.test(l)) {
        optionLines.unshift(l.replace(/^\*?\s*([Oo]pci[oó]n\s*)?[1-5][:.)]\s*/i, '').replace(/\*$/, '').trim());
        foundOptions = true;
      } else if (foundOptions && l === '') {
        continue;
      } else {
        nonOptionLines.unshift(...lines.slice(0, i + 1));
        break;
      }
    }
    if (optionLines.length >= 2) {
      options = optionLines;
      text = nonOptionLines.join('\n').trim();
    }
  }

  // --- Clean up any remaining JSON artifacts from narrative ---
  // Remove stray JSON blobs that the model sometimes injects
  text = text.replace(/\{[\s\S]{0,2000}?"intentions"[\s\S]*?\}/g, '').trim();
  text = text.replace(/```json[\s\S]*?```/g, '').trim();
  text = text.replace(/```[\s\S]*?```/g, '').trim();

  return {
    narrative: text || 'El Dungeon Master contempla tu acción en silencio.',
    options,
    intentions,
  };
}
