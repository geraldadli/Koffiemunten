import { readFileSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
const root = fileURLToPath(new URL('../', import.meta.url));
export function compileContracts() {
  const sources = Object.fromEntries(['CoffeeCampaign.sol', 'MockIDR.sol'].map(name => [name, { content: readFileSync(path.join(root, 'contracts', name), 'utf8') }]));
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } }), { import(name) { try { return { contents: readFileSync(path.join(root, 'node_modules', name), 'utf8') }; } catch { return { error: `Import not found: ${name}` }; } } }));
  for (const issue of output.errors || []) if (issue.severity === 'error') throw Error(issue.formattedMessage);
  return Object.fromEntries(Object.entries(output.contracts).filter(([file]) => file in sources).flatMap(([, contracts]) => Object.entries(contracts).map(([name, contract]) => [name, { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` }])));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const artifacts = compileContracts();
  for (const [name, artifact] of Object.entries(artifacts)) writeFileSync(path.join(root, 'artifacts', `${name}.json`), JSON.stringify(artifact, null, 2));
  mkdirSync(path.join(root, 'dist', 'contracts'), { recursive: true });
  writeFileSync(path.join(root, 'dist', 'contracts', 'CoffeeCampaign.json'), JSON.stringify(artifacts.CoffeeCampaign));
  for (const name of ['CoffeeCampaign.sol', 'MockIDR.sol']) copyFileSync(path.join(root, 'contracts', name), path.join(root, 'dist', 'contracts', name));
  console.log(`Compiled CoffeeCampaign and MockIDR with Solidity ${solc.version()}`);
}
