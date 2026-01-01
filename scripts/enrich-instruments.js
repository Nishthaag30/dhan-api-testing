/**
 * Script to enrich stockCodes.ts with securityId from Dhan CSV
 * 
 * This script:
 * 1. Reads the Dhan instruments CSV
 * 2. Maps symbols to securityIds and exchange segments
 * 3. Updates stockCodes.ts with enriched data
 */

const fs = require('fs');
const path = require('path');

// Read current stock codes
const stockCodesPath = path.join(__dirname, '..', 'stockCodes.ts');
const stockCodesContent = fs.readFileSync(stockCodesPath, 'utf-8');

// Extract symbols from stockCodes.ts
let symbolMatch = stockCodesContent.match(/export const STOCK_CODES = \[([\s\S]*?)\];/);
if (!symbolMatch) {
  throw new Error('Could not find STOCK_CODES in stockCodes.ts');
}

const symbolLines = symbolMatch[1]
  .split('\n')
  .map(line => line.trim())
  .filter(line => {
    const cleaned = line.replace(/^["']|["'],?\s*$/g, '').trim();
    return cleaned && cleaned.endsWith('.NS');
  })
  .map(line => {
    return line.replace(/^["']|["'],?\s*$/g, '').replace(/\.NS$/, '').trim();
  })
  .filter(s => s);

console.log(`Found ${symbolLines.length} symbols to enrich`);
console.log(`First few symbols: ${symbolLines.slice(0, 5).join(', ')}`);

// Read CSV file
const csvPath = path.join(__dirname, '..', 'dhan-instruments.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const csvLines = csvContent.split('\n');

// Parse header
const headers = csvLines[0].split(',').map(h => h.trim());
const exchIdIndex = headers.indexOf('EXCH_ID');
const segmentIndex = headers.indexOf('SEGMENT');
const securityIdIndex = headers.indexOf('SECURITY_ID');
const underlyingSymbolIndex = headers.indexOf('UNDERLYING_SYMBOL'); // Trading symbol
const symbolNameIndex = headers.indexOf('SYMBOL_NAME'); // Full company name
const instrumentTypeIndex = headers.indexOf('INSTRUMENT_TYPE');

console.log('Column indices:', { exchIdIndex, segmentIndex, securityIdIndex, underlyingSymbolIndex, symbolNameIndex, instrumentTypeIndex });

// Parse CSV rows and build instrument map
const instruments = new Map();
let nseRowCount = 0;
let eqRowCount = 0;

for (let i = 1; i < csvLines.length; i++) {
  const line = csvLines[i].trim();
  if (!line) continue;

  // Parse CSV - split by comma
  const fields = line.split(',');
  
  if (fields.length < 10) continue; // Need at least 10 fields

  const exchId = (fields[exchIdIndex] || '').trim();
  const segment = (fields[segmentIndex] || '').trim();
  const securityId = (fields[securityIdIndex] || '').trim();
  const underlyingSymbol = (fields[underlyingSymbolIndex] || '').trim(); // Trading symbol (e.g., "RELIANCE")
  const symbolName = (fields[symbolNameIndex] || '').trim(); // Full company name
  const instrumentType = (fields[instrumentTypeIndex] || '').trim();

  // Count for debugging
  if (exchId === 'NSE') {
    nseRowCount++;
    if (segment === 'E') {
      eqRowCount++;
      // Debug: print first few equity rows
      if (eqRowCount <= 5) {
        console.log(`Sample equity row: EXCH=${exchId}, SEG=${segment}, SEC_ID=${securityId}, TRADING_SYMBOL=${underlyingSymbol}, TYPE=${instrumentType}`);
      }
    }
  }

  // Filter for NSE equity stocks
  // EXCH_ID = "NSE", SEGMENT = "E" (not "EQ"), INSTRUMENT_TYPE = "ES"
  if (exchId === 'NSE' && segment === 'E' && instrumentType === 'ES' && underlyingSymbol) {
    const symbol = underlyingSymbol.toUpperCase();
    // Store with trading symbol as key (keep first occurrence if duplicates)
    if (symbol && securityId && !instruments.has(symbol)) {
      instruments.set(symbol, {
        EXCH_ID: exchId,
        SEGMENT: segment,
        SECURITY_ID: securityId,
        TRADING_SYMBOL: underlyingSymbol,
        SYMBOL_NAME: symbolName,
        INSTRUMENT_TYPE: instrumentType,
      });
    }
  }
}

console.log(`\nCSV Statistics:`);
console.log(`  Total NSE rows: ${nseRowCount}`);
console.log(`  Total NSE,E,ES rows (equity stocks): ${eqRowCount}`);
console.log(`  Unique NSE equity instruments found: ${instruments.size}`);

// Map symbols to enriched instruments
const enrichedInstruments = [];
const missingSymbols = [];

for (const symbol of symbolLines) {
  const csvRow = instruments.get(symbol.toUpperCase());
  
  if (csvRow && csvRow.SECURITY_ID) {
    enrichedInstruments.push({
      symbol: `${symbol}.NS`,
      exchange: 'NSE_EQ',
      securityId: csvRow.SECURITY_ID,
    });
  } else {
    missingSymbols.push(symbol);
  }
}

console.log(`\n✅ Successfully enriched: ${enrichedInstruments.length} instruments`);
console.log(`⚠️  Missing: ${missingSymbols.length} symbols`);

if (missingSymbols.length > 0) {
  if (missingSymbols.length <= 30) {
    console.log('\nMissing symbols:', missingSymbols.join(', '));
  } else {
    console.log('\nFirst 30 missing symbols:', missingSymbols.slice(0, 30).join(', '));
    console.log(`... and ${missingSymbols.length - 30} more`);
  }
  
  // Try to find close matches in CSV
  console.log('\nChecking if symbols exist with different casing or format...');
  const csvSymbols = Array.from(instruments.keys()).slice(0, 20);
  console.log('Sample symbols in CSV:', csvSymbols.join(', '));
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

// Write updated file only if we found at least some instruments
if (enrichedInstruments.length > 0) {
  fs.writeFileSync(stockCodesPath, enrichedContent, 'utf-8');
  console.log(`\n✅ Updated ${stockCodesPath}`);
  console.log(`   Total instruments: ${enrichedInstruments.length}`);
  if (missingSymbols.length > 0) {
    console.log(`   ⚠️  ${missingSymbols.length} symbols could not be enriched`);
  }
} else {
  console.log(`\n❌ No instruments found! Not updating file.`);
  console.log(`   Please check the CSV format and filtering criteria.`);
}