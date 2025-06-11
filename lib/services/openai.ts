import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { EnrichmentField, EnrichmentResult } from '../types';

export class OpenAIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  createEnrichmentSchema(fields: EnrichmentField[]) {
    const schemaProperties: Record<string, z.ZodTypeAny> = {};

    fields.forEach(field => {
      let fieldSchema: z.ZodTypeAny;
      
      switch (field.type) {
        case 'string':
          fieldSchema = z.string();
          break;
        case 'number':
          fieldSchema = z.number();
          break;
        case 'boolean':
          fieldSchema = z.boolean();
          break;
        case 'array':
          fieldSchema = z.array(z.string());
          break;
        default:
          fieldSchema = z.string();
      }

      if (!field.required) {
        fieldSchema = fieldSchema.nullable();
      }

      schemaProperties[field.name] = fieldSchema;
    });

    // Add confidence scores and source evidence for each field
    const confidenceProperties: Record<string, z.ZodTypeAny> = {};
    const sourceEvidenceProperties: Record<string, z.ZodTypeAny> = {};
    fields.forEach(field => {
      confidenceProperties[`${field.name}_confidence`] = z.number().min(0).max(1);
      // Each field can have multiple sources with their own quotes
      sourceEvidenceProperties[`${field.name}_sources`] = z.array(z.object({
        url: z.string(),
        quote: z.string()
      })).nullable();
    });

    return z.object({
      ...schemaProperties,
      ...confidenceProperties,
      ...sourceEvidenceProperties,
    });
  }

  createCorroboratedEnrichmentSchema(fields: EnrichmentField[]) {
    const schemaProperties: Record<string, z.ZodTypeAny> = {};

    fields.forEach(field => {
      // Create typed schema for value based on field type
      let valueSchema: z.ZodTypeAny;
      switch (field.type) {
        case 'string':
          valueSchema = z.string();
          break;
        case 'number':
          valueSchema = z.number();
          break;
        case 'boolean':
          valueSchema = z.boolean();
          break;
        case 'array':
          valueSchema = z.array(z.string());
          break;
        default:
          valueSchema = z.string();
      }
      // Make it nullable since evidence might not find the value
      valueSchema = valueSchema.nullable();

      // Each field has an array of evidence from different sources
      const evidenceSchema = z.object({
        value: valueSchema, // Use typed schema instead of z.any()
        source_url: z.string(), // Which URL this came from
        exact_text: z.string(), // The exact text where this was found
        confidence: z.number().min(0).max(1), // Confidence for this specific source
      });

      schemaProperties[field.name] = z.object({
        evidence: z.array(evidenceSchema),
        consensus_value: valueSchema, // Use same typed schema for consensus
        consensus_confidence: z.number().min(0).max(1), // Overall confidence
        sources_agree: z.boolean(), // Do all sources agree on the value?
      });
    });

    return z.object(schemaProperties);
  }

  async extractStructuredDataOriginal(
    content: string,
    fields: EnrichmentField[],
    context: Record<string, string>
  ): Promise<Record<string, EnrichmentResult>> {
    try {
      const schema = this.createEnrichmentSchema(fields);
      const fieldDescriptions = fields
        .map(f => `- ${f.name}: ${f.description}`)
        .join('\n');

      // Format context to emphasize company identity
      
      const contextInfo = Object.entries(context)
        .map(([key, value]) => {
          if (key === 'targetDomain' && value) {
            return `Company Domain: ${value} (if you see content from this domain, it's likely the target company)`;
          }
          if (key === 'name' || key === '_parsed_name') {
            return `Person Name: ${value}`;
          }
          return `${key}: ${value}`;
        })
        .filter(line => !line.includes('undefined'))
        .join('\n');

      // Trim content to prevent token overflow
      const MAX_CONTENT_CHARS = 400000; // Conservative limit for 128k token model
      
      let trimmedContent = content;
      if (content.length > MAX_CONTENT_CHARS) {
        console.log(`[OPENAI] Content too long (${content.length} chars), trimming to ${MAX_CONTENT_CHARS} chars`);
        trimmedContent = content.substring(0, MAX_CONTENT_CHARS) + '\n\n[Content truncated due to length...]';
      }

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert data extractor. Extract the requested information from the provided content with high accuracy.
            
**CRITICAL RULE**: You MUST ONLY extract information that is EXPLICITLY STATED in the provided content. DO NOT make up, guess, or infer any values. If the information is not clearly present in the text, you MUST return null.

**IMPORTANT**: If a Person Name is provided in the context, you should:
1. Look for information about THAT SPECIFIC PERSON's current company/employer
2. Extract information about the company where this person currently works
3. Do NOT extract information about other companies mentioned unless they are the person's current employer

For each field, you must provide:
1. The extracted value (or null if not found)
2. A confidence score between 0 and 1
3. A sources array - an array of objects, each containing:
   - url: The URL where you found this information (from "URL:" in content)
   - quote: The EXACT text from THAT SPECIFIC source about this field (NOT shared across sources)

Confidence scores:
- 1.0: Information is explicitly stated with exact values/text in the provided content
- 0.8-0.9: Information is clearly present with minor inference needed
- 0.5-0.7: Information requires some interpretation but is based on actual content
- 0.3-0.4: Information is unclear or contradictory
- 0.0-0.2: Information is NOT FOUND in the content

**MANDATORY**: 
1. If you cannot find the specific information, return null for that field
2. Set confidence to 0.0 if not found
3. For the sources array, include EACH source that mentions the information
4. IMPORTANT: Each source must have its OWN unique quote from that specific URL - extract the actual text from each source

**EXAMPLE**:
If you're looking for info about "Example Corp" and the content contains:
"URL: techcrunch.com ... Example Corp has grown to 150 employees this year..."
"URL: forbes.com ... The company Example Corp now employs 150 people..."
"URL: seekcompany.com ... Seek offers AI for data analytics with 200 employees..."

For Example Corp's employee count, you would return:
{
  "employeeCount": 150,
  "employeeCount_confidence": 1.0,
  "employeeCount_sources": [
    {"url": "techcrunch.com", "quote": "Example Corp has grown to 150 employees this year"},
    {"url": "forbes.com", "quote": "The company Example Corp now employs 150 people"}
  ]
}

**ACCEPTABLE VARIATIONS**:
If looking for "Seek AI" and find:
- "Seek offers AI for data" from seek.ai domain → This IS the same company
- "Seek has 200 employees" from seek.ai → This IS valid

**WRONG EXAMPLE**:
If looking for "Example Corp" but finding "Microsoft has 200,000 employees":
- Value: null (because Microsoft is clearly a different company)
- Confidence: 0.0
- Source quote: null
- Source URLs: null

**CRITICAL**: Use domain names and context to verify if it's the same company. Be smart about name variations.

**TARGET ENTITY - IMPORTANT**: You are ONLY extracting information about:
${contextInfo}

**CRITICAL**: 
- Only extract information about the TARGET ENTITY listed above
- Company name variations are OK (e.g., "Seek AI" vs "Seek", "OpenAI" vs "Open AI")
- Look for domain matches (e.g., if searching for "Seek AI" and you see content from seek.ai, that's likely the same company)
- Common variations to accept:
  - With/without "Inc", "Corp", "LLC", "Ltd"
  - With/without spaces in compound names
  - With/without industry descriptors ("AI", "Software", etc.)
- Use proper capitalization for known companies (e.g., "OneTrust" not "onetrust", "Scale AI" not "scale")
- Always capitalize industry names properly (e.g., "Technology", "Healthcare", "E-commerce", "Finance")
- If you find information about CLEARLY DIFFERENT companies, IGNORE IT

Fields to extract for the TARGET ENTITY ONLY:
${fieldDescriptions}

ADDITIONAL GUIDELINES:
1. Employee Count: Must be explicitly stated. Look for phrases like "X employees", "team of X", "X people". If not found, return null.
2. Funding Stage: Must be explicitly mentioned (e.g., "raised Series A", "seed funding"). If not found, return null.
3. Revenue: Must be explicitly stated with numbers. If not found, return null.
4. Year Founded: Must be explicitly mentioned (e.g., "founded in X", "established X"). If not found, return null.
5. DO NOT use general knowledge or make educated guesses.
6. DO NOT fill in values based on what seems likely.
7. ONLY extract what is ACTUALLY WRITTEN in the provided content.
8. When multiple sources mention the same field, extract the ACTUAL QUOTE from EACH source - do not copy the same quote to multiple sources.

REMEMBER: It is better to return null than to guess or make up information.

CRITICAL FOR SOURCES: Each URL in the content has its own unique text. When you find information in multiple sources:
- Go to each URL section in the content
- Find the EXACT sentence/phrase from THAT specific URL
- Do NOT reuse quotes across different URLs
- Each source should have its own unique quote as it appears in that source

DOMAIN PARKING/SALE PAGES:
- If you see content about "domain for sale", "buy this domain", "make an offer", "checkout the full domain details", etc., this is NOT valid company information
- Domain parking pages are NOT legitimate sources - return null for all fields if only parking pages are found
- Look for actual company websites with real business information`,
          },
          {
            role: 'user',
            content: trimmedContent,
          },
        ],
        response_format: zodResponseFormat(schema, 'enrichment_data'),
      });

      const messageContent = response.choices[0].message.content;
      if (!messageContent) {
        throw new Error('No response content');
      }
      
      const parsed = JSON.parse(messageContent);

      // Transform the flat structure into EnrichmentResult format
      const results: Record<string, EnrichmentResult> = {};
      
      fields.forEach(field => {
        let value = parsed[field.name];
        let confidence = parsed[`${field.name}_confidence`] as number;
        const sourcesWithQuotes = parsed[`${field.name}_sources`] as Array<{url: string, quote: string}> | null;
        
        // Filter out invalid placeholder values
        if (value === '/' || value === '-' || value === 'N/A' || value === 'n/a') {
          value = null;
        }
        
        // Post-processing validation for specific fields
        if (value !== null && value !== undefined) {
          // Employee count validation
          if ((field.name === 'employeeCount' || field.displayName === 'Employee Count') && typeof value === 'number') {
            if (value > 1000000) {
              // Likely a parsing error (e.g., "500+" interpreted as 500,000)
              console.warn(`Unrealistic employee count detected: ${value}. Reducing confidence.`);
              confidence = Math.min(confidence, 0.3);
            }
          }
          
          // Year founded validation
          if ((field.name === 'yearFounded' || field.displayName === 'Year Founded') && typeof value === 'number') {
            const currentYear = new Date().getFullYear();
            if (value < 1800 || value > currentYear) {
              confidence = Math.min(confidence, 0.2);
            }
          }
          
          // Funding stage normalization
          if ((field.name === 'fundingStage' || field.displayName === 'Funding Stage') && typeof value === 'string') {
            // Normalize funding stage values
            const normalized = value.toLowerCase();
            if (normalized.includes('seed') && !normalized.includes('pre')) {
              value = 'Seed';
            } else if (normalized.includes('pre-seed') || normalized.includes('preseed')) {
              value = 'Pre-seed';
            } else if (normalized.match(/series\s*[a-e]/i)) {
              const series = normalized.match(/series\s*([a-e])/i)?.[1]?.toUpperCase();
              if (series) value = `Series ${series}`;
            }
          }
        }
        
        // Only include results with actual data found (confidence > 0.3)
        // This prevents hallucinated data from being shown
        if (value !== null && value !== undefined && confidence > 0.3) {
          results[field.name] = {
            field: field.name,
            value,
            confidence,
            source: sourcesWithQuotes ? sourcesWithQuotes.map(s => s.url).join(', ') : 'structured_extraction',
            sourceContext: sourcesWithQuotes ? sourcesWithQuotes.map(s => ({
              url: s.url,
              snippet: s.quote
            })) : undefined,
            // Don't set sourceCount here - let the UI count actual sources after filtering
          };
        }
      });

      return results;
    } catch (error) {
      console.error('OpenAI extraction error:', error);
      throw new Error('Failed to extract structured data');
    }
  }

  async extractStructuredDataWithCorroboration(
    content: string,
    fields: EnrichmentField[],
    context: Record<string, string>
  ): Promise<Record<string, EnrichmentResult>> {
    try {
      console.log('Starting corroborated extraction for fields:', fields.map(f => f.name));
      
      const schema = this.createCorroboratedEnrichmentSchema(fields);
      const fieldDescriptions = fields
        .map(f => `- ${f.name}: ${f.description}`)
        .join('\n');

      // Format context to emphasize company identity
      
      const contextInfo = Object.entries(context)
        .map(([key, value]) => {
          if (key === 'targetDomain' && value) {
            return `Company Domain: ${value} (if you see content from this domain, it's likely the target company)`;
          }
          if (key === 'name' || key === '_parsed_name') {
            return `Person Name: ${value}`;
          }
          return `${key}: ${value}`;
        })
        .filter(line => !line.includes('undefined'))
        .join('\n');

      // Add custom instructions if provided
      const customInstructions = context.instruction ? `\n\n**SPECIFIC INSTRUCTIONS FOR THIS EXTRACTION**:\n${context.instruction}` : '';
      
      // Trim content to prevent token overflow
      // Approximate: 1 token ≈ 4 characters, GPT-4o has 128k token limit
      // Reserve ~8k tokens for system prompt, response format, and response
      // That leaves ~120k tokens for content = ~480k characters
      const MAX_CONTENT_CHARS = 400000; // Conservative limit
      
      let trimmedContent = content;
      if (content.length > MAX_CONTENT_CHARS) {
        console.log(`[OPENAI] Content too long (${content.length} chars), trimming to ${MAX_CONTENT_CHARS} chars`);
        trimmedContent = content.substring(0, MAX_CONTENT_CHARS) + '\n\n[Content truncated due to length...]';
      }
      
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert data extractor. Extract information with evidence from each source.

**CRITICAL INSTRUCTIONS**:
1. For EACH field, find ALL mentions across ALL sources
2. Return an array of evidence for each field
3. Each evidence entry must include:
   - value: The exact value found (or null if not found)
   - source_url: The URL where this was found
   - exact_text: The EXACT sentence/phrase containing this information (copy verbatim)
   - confidence: How confident you are in this specific extraction (0-1)
4. ONLY include evidence that is EXPLICITLY STATED in the content
5. DO NOT make up or infer values
6. If a source doesn't mention a field, DO NOT create evidence for it
7. For consensus_value: Choose the most common/reliable value from the evidence
8. For sources_agree: Set to true only if all sources have the same value
9. NEVER use placeholder values like "/", "-", "N/A", or "n/a" - use null instead
10. If information is not found, consensus_value should be null
11. DO NOT create fake URLs - only use URLs that actually appear in the content
12. ALWAYS capitalize fields properly:
    - Industry names should be capitalized (e.g., "Technology", "Healthcare", "Finance")
    - Company names should use proper casing (e.g., "OneTrust" not "onetrust")
    - Job titles should be capitalized (e.g., "Chief Executive Officer", "VP of Sales")${customInstructions}

Context about the entity:
${contextInfo}

Fields to extract:
${fieldDescriptions}

Example format for employee count:
{
  "employeeCount": {
    "evidence": [
      {
        "value": 150,
        "source_url": "https://example.com/about",
        "exact_text": "Our team of 150 employees works across 3 offices",
        "confidence": 1.0
      },
      {
        "value": null,
        "source_url": "https://news.com/article",
        "exact_text": "",
        "confidence": 0.0
      }
    ],
    "consensus_value": 150,
    "consensus_confidence": 0.9,
    "sources_agree": false
  }
}`
          },
          {
            role: 'user',
            content: trimmedContent,
          },
        ],
        response_format: zodResponseFormat(schema, 'corroborated_data'),
        temperature: 0.1, // Lower temperature for more consistent extraction
      });

      const messageContent = response.choices[0].message.content;
      if (!messageContent) {
        throw new Error('No response content');
      }
      
      const parsed = JSON.parse(messageContent);

      // Transform corroborated data into EnrichmentResult format
      const results: Record<string, EnrichmentResult> = {};
      
      fields.forEach(field => {
        const fieldData = parsed[field.name];
        if (!fieldData) return;
        
        // Only include if we have actual evidence with good confidence
        const validEvidence = fieldData.evidence.filter(
          (e: { value: unknown; confidence: number }) => e.value !== null && e.confidence > 0.2
        );
        
        if (validEvidence.length > 0 && fieldData.consensus_confidence > 0.2) {
          // Validate the consensus value - filter out invalid values like "/"
          let consensusValue = fieldData.consensus_value;
          if (consensusValue === '/' || consensusValue === '-' || consensusValue === 'N/A' || consensusValue === 'n/a') {
            consensusValue = null;
          }
          
          // Only create result if we have a valid value
          if (consensusValue !== null && consensusValue !== undefined && consensusValue !== '') {
            const enrichmentResult: EnrichmentResult = {
              field: field.name,
              value: consensusValue,
              confidence: fieldData.consensus_confidence,
              source: validEvidence.map((e: { source_url: string }) => e.source_url).join(', '),
              sourceContext: validEvidence.map((e: { source_url: string; exact_text: string }) => ({
                url: e.source_url,
                snippet: e.exact_text,
              })),
              corroboration: {
                evidence: fieldData.evidence,
                sources_agree: fieldData.sources_agree,
              },
            };
          
            // Additional validation for tech stack fields
            if (field.name.toLowerCase().includes('tech') || field.name.toLowerCase().includes('stack')) {
              // Validate GitHub URLs in evidence
              if (enrichmentResult.corroboration) {
                enrichmentResult.corroboration.evidence = enrichmentResult.corroboration.evidence.filter((e) => {
                if (e.source_url && e.source_url.includes('github.com')) {
                  // Check if this GitHub URL was provided in the context
                  const validGithubUrls = Array.isArray(context.validGithubUrls) ? context.validGithubUrls as string[] : [];
                  const isValid = validGithubUrls.includes(e.source_url);
                  if (!isValid) {
                    console.log(`[VALIDATION] Removing hallucinated GitHub URL from evidence: ${e.source_url}`);
                    return false;
                  }
                }
                return true;
                });
              }
              
              // Validate tech stack values
              if (Array.isArray(enrichmentResult.value)) {
                const genericTechs = ['website', 'web', 'internet', 'computer', 'software', 'technology', 'platform', 'system', 'application'];
                enrichmentResult.value = enrichmentResult.value.filter((tech) => {
                  const techStr = String(tech).toLowerCase().trim();
                  // Remove generic terms
                  if (genericTechs.includes(techStr)) return false;
                  // Remove single letters
                  if (techStr.length <= 1) return false;
                  // Remove if it's just punctuation or numbers
                  if (!/[a-zA-Z]/.test(techStr)) return false;
                  return true;
                });
                
                // If no valid technologies remain, skip this field
                if (enrichmentResult.value.length === 0) {
                  console.log(`[VALIDATION] No valid technologies found for ${field.name}, skipping field`);
                  return;
                }
              }
            }
            
            // Debug log to verify corroboration data
            if (fieldData.evidence.length > 0) {
              console.log(`Field ${field.name} has ${fieldData.evidence.length} evidence items, sources_agree: ${fieldData.sources_agree}`);
            }
            
            results[field.name] = enrichmentResult;
          }
        }
      });

      return results;
    } catch (error) {
      console.error('OpenAI corroborated extraction error:', error);
      // Fallback to original extraction method
      return this.extractStructuredDataOriginal(content, fields, context);
    }
  }

  async extractStructuredData(
    prompt: string,
    schema: Record<string, string>
  ): Promise<Record<string, unknown>> {
    try {
      const schemaDescription = Object.entries(schema)
        .map(([key, type]) => `- ${key}: ${type}`)
        .join('\n');
      
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Extract structured data based on the prompt. Return valid JSON matching this schema:
${schemaDescription}

**CRITICAL RULES**:
1. ONLY extract information that is EXPLICITLY STATED in the provided content
2. DO NOT make up, guess, or infer any values
3. If information is not found in the content, you MUST use null
4. Return ONLY valid JSON
5. Ensure all strings are properly escaped
6. Keep values concise

**FORBIDDEN**: Do not use general knowledge or make educated guesses. Only extract what is ACTUALLY WRITTEN in the prompt.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000,
      });
      
      const content = response.choices[0].message.content;
      if (!content) {
        console.warn('No content in OpenAI response');
        return {};
      }
      
      try {
        // Clean up potential issues
        const cleanedContent = content
          .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
          .replace(/\n\s*\n/g, '\n') // Remove extra newlines
          .trim();
        
        return JSON.parse(cleanedContent);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.error('Content that failed to parse:', content.substring(0, 500) + '...');
        
        // Try to extract valid JSON if it's embedded
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            return JSON.parse(jsonMatch[0]);
          } catch {
            // Fall through to return empty object
          }
        }
        
        return {};
      }
    } catch (error) {
      console.error('OpenAI extraction error:', error);
      return {};
    }
  }

  async generateSearchQueries(
    context: Record<string, string>,
    targetField: string,
    existingQueries: string[] = []
  ): Promise<string[]> {
    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Generate effective search queries to find information about "${targetField}" for the given entity.
            
Rules:
1. Generate 2-3 different search queries
2. Use various search strategies (company name + field, person name + company, domain search, etc.)
3. Make queries specific and likely to return relevant results
4. Avoid queries that are too generic
5. If email is provided, intelligently parse it to extract useful components`,
          },
          {
            role: 'user',
            content: `Context: ${JSON.stringify(context)}
            
Previous queries tried: ${existingQueries.join(', ')}
            
Generate new search queries to find: ${targetField}`,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.queries || [];
    } catch (error) {
      console.error('Query generation error:', error);
      return [];
    }
  }
}