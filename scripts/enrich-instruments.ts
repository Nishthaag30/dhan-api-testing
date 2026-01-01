/**
 * Script to enrich stockCodes.ts with securityId from Dhan CSV
 * 
 * This script:
 * 1. Reads the Dhan instruments CSV
 * 2. Maps symbols to securityIds and exchange segments
 * 3. Updates stockCodes.ts with enriched data
 */

import * as fs from 'fs';
import * as path from 'path';

interface CsvRow {
  EXCH_ID: string;
  SEGMENT: string;
  SECURITY_ID: string;
  SYMBOL_NAME: string;
  INSTRUMENT_TYPE: string;
}

interface DhanInstrument {
  symbol: string;
  exchange: 'NSE_EQ' | 'NSE_FNO';
  securityId: string;
}

// Read current stock codes
const stockCodesPath = path.join(__dirname, '..', 'stockCodes.ts');
const stockCodesContent = fs.readFileSync(stockCodesPath, 'utf-8');

// Extract symbols from stockCodes.ts
const symbolMatch = stockCodesContent.match(/export const STOCK_CODES = \[([\s\S]*?)\];/);
if (!symbolMatch) {
  throw new Error('Could not find STOCK_CODES in stockCodes.ts');
}

const symbolLines = symbolMatch[1]
  .split('\n')
  .map(line => line.trim())
  .filter(line => line && line.startsWith('"') && line.endsWith('.NS"'))
  .map(line => line.replace(/"/g, '').replace(/,/g, '').replace('.NS', ''));

console.log(`Found ${symbolLines.length} symbols to enrich`);

// Read CSV file
const csvPath = path.join(__dirname, '..', 'dhan-instruments.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const csvLines = csvContent.split('\n');
const headers = csvLines[0].split(',').map(h => h.trim());

console.log('CSV Headers:', headers.slice(0, 10).join(', '));

// Find indices for columns we need
const exchIdIndex = headers.indexOf('EXCH_ID');
const segmentIndex = headers.indexOf('SEGMENT');
const securityIdIndex = headers.indexOf('SECURITY_ID');
const symbolNameIndex = headers.indexOf('SYMBOL_NAME');
const instrumentTypeIndex = headers.indexOf('INSTRUMENT_TYPE');

if (exchIdIndex === -1 || segmentIndex === -1 || securityIdIndex === -1 || symbolNameIndex === -1) {
  throw new Error('Required columns not found in CSV');
}

// Parse CSV rows
const instruments = new Map<string, CsvRow>();

for (let i = 1; i < csvLines.length; i++) {
  const line = csvLines[i].trim();
  if (!line) continue;

  // Parse CSV line (handle quoted fields)
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  fields.push(currentField.trim());

  if (fields.length < Math.max(exchIdIndex, segmentIndex, securityIdIndex, symbolNameIndex) + 1) {
    continue;
  }

  const exchId = fields[exchIdIndex]?.trim();
  const segment = fields[segmentIndex]?.trim();
  const securityId = fields[securityIdIndex]?.trim();
  const symbolName = fields[symbolNameIndex]?.trim();
  const instrumentType = fields[instrumentTypeIndex]?.trim() || '';

  // Filter for NSE equity stocks
  if (exchId === 'NSE' && segment === 'EQ' && instrumentType === 'EQ') {
    const symbol = symbolName.toUpperCase();
    // Store with symbol as key, keep first occurrence
    if (!instruments.has(symbol)) {
      instruments.set(symbol, {
        EXCH_ID: exchId,
        SEGMENT: segment,
        SECURITY_ID: securityId,
        SYMBOL_NAME: symbolName,
        INSTRUMENT_TYPE: instrumentType,
      });
    }
  }
}

console.log(`Found ${instruments.size} NSE_EQ instruments in CSV`);

// Map symbols to enriched instruments
const enrichedInstruments: DhanInstrument[] = [];
const missingSymbols: string[] = [];

for (const symbol of symbolLines) {
  const csvRow = instruments.get(symbol);
  
  if (csvRow && csvRow.SECURITY_ID) {
    enrichedInstruments.push({
      symbol: `${symbol}.NS`,
      exchange: 'NSE_EQ',
      securityId: csvRow.SECURITY_ID,
    });
  } else {
    missingSymbols.push(symbol);
    console.warn(`Warning: Could not find securityId for ${symbol}`);
  }
}

console.log(`\nSuccessfully enriched: ${enrichedInstruments.length} instruments`);
console.log(`Missing: ${missingSymbols.length} symbols`);

if (missingSymbols.length > 0) {
  console.log('\nMissing symbols:', missingSymbols.slice(0, 10).join(', '));
}

// Generate new stockCodes.ts content
const enrichedContent = `/**
 * Array of stock instruments with Dhan securityId mapping
 * Each instrument includes symbol, exchange segment, and securityId
 * These are NSE equity stocks with .NS suffix
 */
export interface DhanInstrument {
  symbol: string;
  exchange: "NSE_EQ" | "NSE_FNO";
  securityId: string; // Required for WebSocket subscription
}

export const STOCK_INSTRUMENTS: DhanInstrument[] = [
${enrichedInstruments
  .map(
    inst =>
      `  { symbol: "${inst.symbol}", exchange: "${inst.exchange}", securityId: "${inst.securityId}" }`
  )
  .join(',\n')}
];

// Backward compatibility: extract just the symbols
export const STOCK_CODES = STOCK_INSTRUMENTS.map(inst => inst.symbol);
`;

// Write updated file
fs.writeFileSync(stockCodesPath, enrichedContent, 'utf-8');
console.log(`\n✅ Updated ${stockCodesPath}`);
console.log(`   Total instruments: ${enrichedInstruments.length}`);

