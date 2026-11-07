import sharp from 'sharp';
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220"><rect width="320" height="220" fill="white"/><text x="20" y="35" font-size="18">QA ONLY - test evidence</text><rect x="55" y="70" width="210" height="100" fill="white" stroke="black"/><circle cx="230" cy="110" r="22" fill="none" stroke="#c00"/><text x="20" y="205" font-size="14">Synthetic fixture, no real defect</text></svg>';
await sharp(Buffer.from(svg)).png().toFile('docs/qa/qa-only-trial-evidence.png');console.log('Synthetic trial-evidence fixture created.');
