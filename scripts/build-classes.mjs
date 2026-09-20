// Fetch DOF's building classification list and write data/building-classes.json.
// Usage: node scripts/build-classes.mjs [path/to/saved.html]
import fs from 'node:fs';

const URL = 'https://www.nyc.gov/assets/finance/jump/hlpbldgcode.html';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

let html;
if (process.argv[2]) {
  html = fs.readFileSync(process.argv[2], 'utf8');
} else {
  const res = await fetch(URL, { headers: { 'User-Agent': UA } }); // nyc.gov's CDN 403s the default UA
  if (!res.ok) throw new Error(`${URL} -> ${res.status}`);
  html = await res.text();
}

const text = html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, '\n')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const lines = text.split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

const out = {};
for (let i = 0; i < lines.length - 1; i++) {
  const code = lines[i];
  if (/^[A-Z][A-Z0-9]?$/.test(code) && !/^[A-Z][A-Z0-9]?$/.test(lines[i + 1]) && lines[i + 1].length > 3) {
    // multi-line descriptions: keep appending until the next code
    let desc = lines[i + 1]; let j = i + 2;
    while (j < lines.length && !/^[A-Z][A-Z0-9]?$/.test(lines[j])) { desc += ' ' + lines[j]; j++; }
    out[code] = desc.replace(/\s+/g, ' ').trim();
  }
}
const n = Object.keys(out).filter(k => k.length === 2).length;
if (n < 150) throw new Error(`Only parsed ${n} two-character codes; page layout may have changed`);
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/building-classes.json', JSON.stringify(out, null, 0) + '\n');
console.log(`wrote data/building-classes.json with ${n} codes`);
