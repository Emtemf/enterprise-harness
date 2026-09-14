#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { attachProviderReceipt } from './lib/provider-receipt.mjs';

const args = process.argv.slice(2);
const usage = 'Usage: node attach-provider-receipt.mjs <raw-results.json> <provider-receipt.json> <reconciled-results.json>';
if (args.includes('--help') || args.includes('-h')) {
  console.log(usage);
  process.exit(0);
}

const [rawPath, receiptPath, outputPath] = args;
if (!rawPath || !receiptPath || !outputPath) {
  console.error(usage);
  process.exit(2);
}
const raw = JSON.parse(fs.readFileSync(path.resolve(rawPath), 'utf-8'));
const receipt = JSON.parse(fs.readFileSync(path.resolve(receiptPath), 'utf-8'));
const reconciled = attachProviderReceipt(raw, receipt);
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(reconciled, null, 2)}\n`);
console.log(`reconciled=${path.resolve(outputPath)}`);
