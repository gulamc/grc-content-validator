// lib/batchProcessor.ts
import * as XLSX from 'xlsx';
import { scoreControl } from '@/scorer/controls';
import { scoreET } from '@/scorer/ets';

export interface BatchItem {
  id: string;
  type: 'control' | 'et';
  data: any;
  status: 'pending' | 'success' | 'error';
  score?: number;
  scoreDetails?: any;
  error?: string;
}

export interface BatchResult {
  items: BatchItem[];
  summary: {
    total: number;
    processed: number;
    errors: number;
    avgScore: number;
  };
}

/**
 * Parse Excel/CSV file and extract items
 */
export async function parseFile(file: File): Promise<{ items: any[], type: 'control' | 'et' }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get first sheet
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const items = XLSX.utils.sheet_to_json(firstSheet);
        
        if (items.length === 0) {
          reject(new Error('No data found in file'));
          return;
        }
        
        // Detect type based on columns
        const firstItem = items[0] as any;
        const isControl = 'control_id' in firstItem || 'controlId' in firstItem || 'Control ID' in firstItem;
        const type = isControl ? 'control' : 'et';
        
        resolve({ items, type });
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Normalize column names (handle different naming conventions)
 */
function normalizeKeys(obj: any): any {
  const normalized: any = {};
  
  console.log('Original keys:', Object.keys(obj));
  
  for (const [key, value] of Object.entries(obj)) {
    // Convert to camelCase and remove spaces
    const normalizedKey = key
      .toLowerCase()
      .replace(/[\s_-]+(.)?/g, (_, chr) => chr ? chr.toUpperCase() : '')
      .replace(/^(.)/, (chr) => chr.toLowerCase());
    
    normalized[normalizedKey] = value;
  }
  
  console.log('Normalized keys:', Object.keys(normalized));
  console.log('Normalized object:', normalized);
  
  return normalized;
}

/**
 * Score a single item
 */
function scoreItem(item: any, type: 'control' | 'et'): { score: number; details: any } {
  const normalized = normalizeKeys(item);
  
  try {
    console.log('Scoring item:', { type, normalized });
    
    let result: any;
    
    if (type === 'control') {
      result = scoreControl(normalized);
    } else {
      result = scoreET(normalized);
    }
    
    console.log('Score result:', result);
    console.log('result.total:', result.total, 'type:', typeof result.total);
    console.log('result.dimensions:', result.dimensions);
    
    // Handle different possible return formats
    let overallScore: number;
    
    // Check if total is an object with a score property (your actual format)
    if (result.total && typeof result.total === 'object' && typeof result.total.score === 'number' && !isNaN(result.total.score)) {
      overallScore = result.total.score;
      console.log('Found valid score in result.total.score:', overallScore);
    }
    // Check if total exists and is a valid number (not NaN)
    else if (result.total !== undefined && result.total !== null && typeof result.total === 'number' && !isNaN(result.total)) {
      overallScore = result.total;
      console.log('Found valid score in result.total:', overallScore);
    }
    // Check if overallScore exists and is valid
    else if (typeof result.overallScore === 'number' && !isNaN(result.overallScore)) {
      overallScore = result.overallScore;
    } 
    // Check if score field exists
    else if (typeof result.score === 'number' && !isNaN(result.score)) {
      overallScore = result.score;
    } 
    // Check if totalScore exists
    else if (typeof result.totalScore === 'number' && !isNaN(result.totalScore)) {
      overallScore = result.totalScore;
    }
    // If result itself is a number
    else if (typeof result === 'number' && !isNaN(result)) {
      overallScore = result;
    }
    // Try to calculate from dimensions (your scorer uses this)
    else if (result.dimensions && typeof result.dimensions === 'object') {
      console.log('Attempting to calculate from dimensions:', result.dimensions);
      console.log('Dimensions entries:', Object.entries(result.dimensions));
      
      const dimensionScores: number[] = [];
      for (const [key, value] of Object.entries(result.dimensions)) {
        console.log(`Checking dimension ${key}:`, value, 'type:', typeof value);
        if (typeof value === 'number' && !isNaN(value)) {
          dimensionScores.push(value);
        } else if (typeof value === 'object' && value !== null) {
          // Handle nested score objects (your actual format: { score: 81, max: 100, ... })
          const nestedScore = (value as any).score;
          if (typeof nestedScore === 'number' && !isNaN(nestedScore)) {
            console.log(`Found nested score in ${key}:`, nestedScore);
            dimensionScores.push(nestedScore);
          }
        }
      }
      
      console.log('Found dimension scores:', dimensionScores);
      
      if (dimensionScores.length > 0) {
        overallScore = dimensionScores.reduce((a, b) => a + b, 0) / dimensionScores.length;
        console.log('Calculated overall score from dimensions:', overallScore);
      } else {
        // If no valid scores, default to 0 instead of throwing error
        console.warn('No valid dimension scores found, defaulting to 0');
        overallScore = 0;
      }
    }
    // Try to calculate from category scores
    else if (result.categoryScores && typeof result.categoryScores === 'object') {
      const scores = Object.values(result.categoryScores).filter(s => typeof s === 'number' && !isNaN(s)) as number[];
      if (scores.length > 0) {
        overallScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        console.log('Calculated overall score from categories:', overallScore);
      } else {
        console.warn('No valid category scores found, defaulting to 0');
        overallScore = 0;
      }
    }
    // Try to calculate from scores object
    else if (result.scores && typeof result.scores === 'object') {
      const scores = Object.values(result.scores).filter(s => typeof s === 'number' && !isNaN(s)) as number[];
      if (scores.length > 0) {
        overallScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        console.log('Calculated overall score from scores:', overallScore);
      } else {
        console.warn('No valid scores found, defaulting to 0');
        overallScore = 0;
      }
    }
    // Default to 0 if nothing else works
    else {
      console.warn('Could not find any valid scores, defaulting to 0');
      console.log('Available keys in result:', Object.keys(result || {}));
      overallScore = 0;
    }
    
    return {
      score: overallScore,
      details: result
    };
  } catch (error) {
    console.error('Scoring error:', error);
    throw new Error(`Scoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Process batch of items
 */
export async function processBatch(
  items: any[],
  type: 'control' | 'et',
  onProgress?: (current: number, total: number) => void
): Promise<BatchResult> {
  const batchItems: BatchItem[] = items.map((item, index) => ({
    id: item.id || item.controlId || item.control_id || item['Control ID'] || item.etId || item.et_id || item['ET ID'] || `item-${index + 1}`,
    type,
    data: item,
    status: 'pending' as const
  }));
  
  let processed = 0;
  let errors = 0;
  let totalScore = 0;
  
  // Process each item
  for (const item of batchItems) {
    try {
      const result = scoreItem(item.data, type);
      item.score = result.score;
      item.scoreDetails = result.details;
      item.status = 'success';
      
      console.log(`Item ${item.id} scored: ${result.score}`);
      
      // Only add to total if score is valid (not NaN)
      if (!isNaN(result.score)) {
        totalScore += result.score;
      }
    } catch (error) {
      console.error(`Error processing item ${item.id}:`, error);
      item.status = 'error';
      item.error = error instanceof Error ? error.message : 'Unknown error';
      errors++;
    }
    
    processed++;
    if (onProgress) {
      onProgress(processed, items.length);
    }
  }
  
  const successCount = processed - errors;
  
  return {
    items: batchItems,
    summary: {
      total: items.length,
      processed,
      errors,
      avgScore: successCount > 0 ? totalScore / successCount : 0
    }
  };
}

/**
 * Export results to Excel
 */
export function exportToExcel(result: BatchResult, filename: string = 'batch-results.xlsx') {
  const exportData = result.items.map(item => ({
    'ID': item.id,
    'Type': item.type.toUpperCase(),
    'Status': item.status.toUpperCase(),
    'Score': item.score !== undefined ? item.score.toFixed(2) : 'N/A',
    'Verdict': item.scoreDetails?.verdict || 'N/A',
    'Error': item.error || ''
  }));
  
  // Add summary sheet
  const summary = [
    { Metric: 'Total Items', Value: result.summary.total },
    { Metric: 'Processed', Value: result.summary.processed },
    { Metric: 'Errors', Value: result.summary.errors },
    { Metric: 'Average Score', Value: result.summary.avgScore.toFixed(2) }
  ];
  
  const wb = XLSX.utils.book_new();
  const wsResults = XLSX.utils.json_to_sheet(exportData);
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  
  XLSX.utils.book_append_sheet(wb, wsResults, 'Results');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  
  XLSX.writeFile(wb, filename);
}