/**
 * Verify a Wonder Lab family archive outside the app.
 *   npm run verify-export -- path/to/WonderLab-Family-Export-YYYY-MM-DD.zip
 * Exit code 0 = intact; 1 = corrupted, missing or tampered files.
 */
import { readFileSync } from 'node:fs';
import { verifyExportZip } from '../src/lib/archive';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run verify-export -- <archive.zip>');
  process.exit(2);
}
const r = await verifyExportZip(new Uint8Array(readFileSync(file)));
if (r.ok) {
  console.log(`OK  ${file}`);
  console.log(`    ${r.fileCount} files · ${r.memoryCount} memories · ${r.mediaCount} original recordings · every SHA-256 matches`);
  process.exit(0);
}
console.error(`FAILED  ${file}`);
for (const e of r.errors) console.error(`  - ${e}`);
process.exit(1);
