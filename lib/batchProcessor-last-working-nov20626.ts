// lib/batchProcessor.ts - CASE-INSENSITIVE VERSION
import * as XLSX from 'xlsx';
import { scoreControl, ControlScoreResponse } from '@/scorer/controls';
import { EtScoreResponse } from '@/scorer/ets';

export type ContentType = 'Control' | 'ET';

export interface BatchItem {
  id: string;
  type: ContentType;
  status: 'pass' | 'fail' | 'error';
  score: number;
  verdict?: 'PASS' | 'FAIL';
  error?: string;
  data: Record<string, any>;
  scoreDetails?: ControlScoreResponse | EtScoreResponse;
}

export interface BatchResults {
  items: BatchItem[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    avgScore: number;
  };
}

// Normalize column names for Controls
function normalizeControlData(data: Record<string, any>): {
  id: string;
  name: string;
  description: string;
  guidance: string;
} {
  const normalized: any = {};
  
  // Find ID field (case-insensitive)
  const idKey = Object.keys(data).find(k => 
    k.toLowerCase().replace(/_/g, '').includes('controlid') || 
    k.toLowerCase() === 'id'
  );
  normalized.id = data[idKey!] || '';
  
  // Find Name field
  const nameKey = Object.keys(data).find(k => 
    k.toLowerCase().replace(/_/g, '').includes('controlname') ||
    k.toLowerCase() === 'name' ||
    k.toLowerCase() === 'title'
  );
  normalized.name = data[nameKey!] || '';
  
  // Find Description field
  const descKey = Object.keys(data).find(k => 
    k.toLowerCase().replace(/_/g, '').includes('controldescription') ||
    k.toLowerCase() === 'description'
  );
  normalized.description = data[descKey!] || '';
  
  // Find Guidance field
  const guidanceKey = Object.keys(data).find(k => 
    k.toLowerCase().replace(/_/g, '').includes('controlguidance') ||
    k.toLowerCase() === 'guidance'
  );
  normalized.guidance = data[guidanceKey!] || '';
  
  return normalized;
}

// Normalize column names for Evidence Tasks
function normalizeETData(data: Record<string, any>): {
  etId: string;
  whatToCollect: string;
  howToCollect: string;
} {
  const normalized: any = {};
  
  // Find ET ID field
  const idKey = Object.keys(data).find(k => 
    k.toLowerCase().replace(/_/g, '').includes('etid') ||
    k.toLowerCase() === 'id'
  );
  normalized.etId = data[idKey!] || '';
  
  // Find What field
  const whatKey = Object.keys(data).find(k => 
    k.toLowerCase().replace(/_/g, '').includes('what') ||
    k.toLowerCase().includes('outcome')
  );
  normalized.whatToCollect = data[whatKey!] || '';
  
  // Find How field
  const howKey = Object.keys(data).find(k => 
    k.toLowerCase().replace(/_/g, '').includes('how') ||
    k.toLowerCase().includes('artifact')
  );
  normalized.howToCollect = data[howKey!] || '';
  
  return normalized;
}

/**
 * Process Excel file for batch validation
 * @param file - The Excel file to process
 * @param contentType - Content type: 'Control', 'ET', 'control', or 'et' (case-insensitive)
 */
export async function processExcelFile(
  file: File, 
  contentType: ContentType | string
): Promise<BatchResults> {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData: any[] = XLSX.utils.sheet_to_json(firstSheet);
    
    if (rawData.length === 0) {
      throw new Error('Excel file is empty');
    }
    
    // Normalize contentType to handle both uppercase and lowercase
    const normalizedType = contentType.toString().toLowerCase();
    const isControl = normalizedType === 'control';
    const isET = normalizedType === 'et' || normalizedType === 'evidence task';
    
    console.log('Processing file as:', contentType, '(normalized:', normalizedType, ')');
    console.log('isControl:', isControl, 'isET:', isET);
    console.log('Columns found:', Object.keys(rawData[0]));
    
    // Process each row based on the content type
    const items: BatchItem[] = [];
    
    for (const row of rawData) {
      try {
        let result: BatchItem;
        
        if (isControl) {
          // Process as Control
          const controlData = normalizeControlData(row);
          
          console.log('Processing Control:', controlData.id);
          
          // Validate required fields
          if (!controlData.id) {
            throw new Error('Missing required field: control_id');
          }
          if (!controlData.description) {
            throw new Error('Missing required field: control_description');
          }
          
          // Score using the Control scorer
          const scoreResult = scoreControl({
            id: controlData.id,
            name: controlData.name,
            description: controlData.description,
            guidance: controlData.guidance
          });
          
          // Extract overall score
          const overallScore = scoreResult.total?.score || 0;
          const verdict = overallScore >= 85 ? 'PASS' : 'FAIL';
          
          result = {
            id: controlData.id,
            type: 'Control',
            status: verdict === 'PASS' ? 'pass' : 'fail',
            score: overallScore,
            verdict,
            data: controlData,
            scoreDetails: scoreResult
          };
          
        } else if (isET) {
          // Process as Evidence Task
          const etData = normalizeETData(row);
          
          console.log('Processing ET:', etData.etId);
          
          // Validate required fields
          if (!etData.etId) {
            throw new Error('Missing required field: et_id');
          }
          if (!etData.whatToCollect) {
            throw new Error('Missing required field: what_to_collect');
          }
          
          // Score using the ET scorer via API (enables AI semantic matching)
          const response = await fetch('/api/et/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              what_to_collect: etData.whatToCollect,
              how_to_collect: etData.howToCollect
            })
          });
          
          if (!response.ok) {
            throw new Error(`Scoring API failed: ${response.status}`);
          }
          
          const scoreResult = await response.json();
          
          // Use the scorer's verdict (respects gating logic)
          const overallScore = scoreResult.total?.score || 0;
          const verdict = scoreResult.verdict?.toUpperCase() || (overallScore >= 85 ? 'PASS' : 'FAIL');
          
          result = {
            id: etData.etId,
            type: 'ET',
            status: verdict === 'PASS' ? 'pass' : 'fail',
            score: verdict === 'PASS' ? overallScore : 0, // 0 for failed items (displays as N/A)
            verdict,
            data: etData,
            scoreDetails: scoreResult
          };
        } else {
          throw new Error(`Unknown content type: ${contentType}`);
        }
        
        items.push(result);
        
      } catch (error: any) {
        // Handle scoring errors
        const headers = Object.keys(row);
        const itemId = row[headers[0]] || 'Unknown';
        items.push({
          id: String(itemId),
          type: isControl ? 'Control' : 'ET',
          status: 'error',
          score: 0,
          error: error.message || 'Scoring failed',
          data: row
        });
      }
    }
    
    // Calculate summary statistics
    const passed = items.filter(i => i.status === 'pass').length;
    const failed = items.filter(i => i.status === 'fail').length;
    const errors = items.filter(i => i.status === 'error').length;
    const totalScore = items
      .filter(i => i.status !== 'error')
      .reduce((sum, i) => sum + i.score, 0);
    const avgScore = items.length > 0 ? totalScore / (items.length - errors) : 0;
    
    return {
      items,
      summary: {
        total: items.length,
        passed,
        failed,
        errors,
        avgScore: Math.round(avgScore * 10) / 10
      }
    };
    
  } catch (error: any) {
    throw new Error(`Failed to process file: ${error.message}`);
  }
}

export function exportToExcel(results: BatchResults): void {
  const exportData = results.items.map(item => ({
    ID: item.id,
    Type: item.type === 'Control' ? 'Control' : 'Evidence Task',
    Score: item.score,
    Verdict: item.verdict || 'ERROR',
    Status: item.status.toUpperCase(),
    Error: item.error || ''
  }));
  
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
  XLSX.writeFile(workbook, `grc-validation-results-${Date.now()}.xlsx`);
}