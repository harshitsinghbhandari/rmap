/**
 * JSON Utility functions for processing LLM responses
 */

/**
 * Extract JSON from LLM response text
 * Handles various formats: raw JSON, markdown code blocks, mixed text
 *
 * @param responseText - The raw text response from the LLM
 * @returns The extracted JSON string
 */
export function extractJson(responseText: string): string {
  let text = responseText.trim();

  // 1. Try to extract from markdown code blocks
  // Handle ```json ... ``` or ``` ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // 2. Find the first '{' and last '}'
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    return text.slice(jsonStart, jsonEnd + 1);
  }

  // 3. If we found a start but no end, it might be truncated.
  // We still remove the leading junk to let JSON.parse give a more accurate error
  if (jsonStart !== -1) {
    return text.slice(jsonStart);
  }

  return text;
}

/**
 * Attempt to fix common JSON issues caused by LLMs, such as unescaped newlines in strings
 *
 * @param jsonText - The JSON string to fix
 * @returns The fixed JSON string
 */
export function fixCommonJsonIssues(jsonText: string): string {
  // Replace unescaped newlines in strings with \n
  // This regex finds strings and escapes newlines within them
  return jsonText.replace(/:\s*"([^"]*?)"/g, (match, content) => {
    const escaped = content
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
    return `: "${escaped}"`;
  });
}
