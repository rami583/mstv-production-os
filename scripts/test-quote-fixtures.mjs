import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const fixtures = [
  {
    file: "Samples/DE260129-894.pdf",
    expected: [
      "detectedClient: 'Mahema'",
      "detectedDate: '2026-04-27'",
      "detectedStartTime: '08:00'",
      "detectedEndTime: '12:00'",
      "detectedOptions: [ 'Prompteur', 'Caméra supplémentaire' ]",
    ],
  },
  {
    file: "Samples/FA260325-1577.pdf",
    expected: [
      "detectedClient: 'Paprec France SAS'",
      "detectedDate: '2026-03-10'",
      "detectedStartTime: '14:00'",
      "detectedEndTime: '18:00'",
      "detectedOptions: [ 'Maquillage', 'Prompteur' ]",
    ],
  },
  {
    file: "Samples/DE260527-948.pdf",
    expected: [
      "detectedClient: 'La Banque Postale'",
      "detectedDate: '2026-06-01'",
      "detectedStartTime: '14:00'",
      "detectedEndTime: '18:00'",
      "detectedOptions: [ 'Maquillage', 'Prompteur' ]",
    ],
  },
];

for (const fixture of fixtures) {
  const absolutePath = path.join(workspaceRoot, fixture.file);
  const { stdout } = await execFileAsync("node", ["scripts/debug-quote-pdf.mjs", absolutePath], {
    cwd: workspaceRoot,
    maxBuffer: 1024 * 1024 * 8,
  });
  const missing = fixture.expected.filter((value) => !stdout.includes(value));
  if (missing.length > 0) {
    console.error(`Quote fixture failed: ${fixture.file}`);
    console.error("Missing expected output:");
    for (const value of missing) console.error(`- ${value}`);
    process.exitCode = 1;
    break;
  }

  console.log(`Quote fixture passed: ${fixture.file}`);
}
