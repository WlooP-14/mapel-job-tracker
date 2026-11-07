const prefix = 'MJT:';

export function boxLabelValue(mouldCode) {
 return prefix + mouldCode;
}

export function scannedMouldCode(value) {
 const text = value.trim();
 const code = text.startsWith(prefix) ? text.slice(prefix.length) : text;
 return /^[a-z0-9][a-z0-9_-]{1,59}$/i.test(code) ? code.toUpperCase() : null;
}
