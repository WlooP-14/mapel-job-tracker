const normalized = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

function partKey(part) {
 return JSON.stringify([
  part.category, normalized(part.name), Number(part.qty_required),
  ...['material', 'finish_size_text', 'rough_size_text', 'size_text', 'remark'].map(key => normalized(part[key]))
 ]);
}

export function existingBomMatches(rows, parts) {
 const saved = new Map(parts.filter(part => !part.archived_at).map(part => [partKey(part), part]));
 return new Map(rows.map(row => [row.id, saved.get(partKey(row))]).filter(([, part]) => part));
}
