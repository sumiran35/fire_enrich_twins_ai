export interface SourceContext {
  url: string;
  snippet: string;
  confidence: number;
}

export function findRelevantSnippet(
  content: string,
  value: string | number | boolean | string[],
  fieldName: string,
  contextWindow: number = 200
): string {
  if (typeof value === 'boolean' || !content || !value || Array.isArray(value)) {
    return '';
  }
  
  const searchValue = String(value).toLowerCase();
  const contentLower = content.toLowerCase();
  
  // For numeric values, be more strict
  let index = -1;
  
  if (typeof value === 'number') {
    // For numbers, look for exact matches with word boundaries
    const numberPatterns = [
      searchValue, // exact number
      searchValue.replace(/000$/g, 'k'), // 1000 -> 1k
      searchValue.replace(/000000$/g, 'm'), // 1000000 -> 1m
      Number(value).toLocaleString(), // 1000 -> 1,000
    ];
    
    for (const pattern of numberPatterns) {
      // Use regex to ensure we're not matching part of a larger number
      const regex = new RegExp(`\\b${pattern}\\b`, 'i');
      const match = content.match(regex);
      if (match && match.index !== undefined) {
        index = match.index;
        break;
      }
    }
  } else {
    // For strings, try exact match first
    index = contentLower.indexOf(searchValue);
    
    // If no exact match, try to find partial matches for longer values
    if (index === -1 && searchValue.length > 20) {
      const words = searchValue.split(/\s+/).filter(w => w.length > 3);
      for (const word of words) {
        const wordIndex = contentLower.indexOf(word);
        if (wordIndex !== -1) {
          index = wordIndex;
          break;
        }
      }
    }
  }
  
  // Only fall back to field name search if we're looking for non-numeric values
  if (index === -1 && typeof value !== 'number') {
    // Try to find field name context
    const fieldNameVariations = [
      fieldName.toLowerCase(),
      fieldName.replace(/_/g, ' ').toLowerCase(),
      fieldName.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
    ];
    
    for (const variation of fieldNameVariations) {
      const fieldIndex = contentLower.indexOf(variation);
      if (fieldIndex !== -1) {
        index = fieldIndex;
        break;
      }
    }
  }
  
  if (index === -1) {
    return '';
  }
  
  // Extract snippet with context
  const start = Math.max(0, index - contextWindow);
  const end = Math.min(content.length, index + searchValue.length + contextWindow);
  
  let snippet = content.substring(start, end);
  
  // Add ellipsis if truncated
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  
  // Clean up whitespace
  snippet = snippet.replace(/\s+/g, ' ').trim();
  
  return snippet;
}

export function highlightValue(snippet: string, value: string): string {
  if (!snippet || !value) return snippet;
  
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedValue})`, 'gi');
  
  return snippet.replace(regex, '**$1**');
}