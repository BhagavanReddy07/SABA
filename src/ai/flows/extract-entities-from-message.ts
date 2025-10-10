import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractEntitiesInputSchema = z.object({
  userInput: z.string().describe('The user input text to analyze for entities.'),
});

const ExtractEntitiesOutputSchema = z.object({
  entities: z.array(z.object({
    type: z.enum(['person', 'place', 'organization', 'date', 'time', 'other']),
    value: z.string(),
    relevance: z.number().min(0).max(1),
  })).describe('Array of entities found in the text'),
});

const extractEntitiesPrompt = ai.definePrompt({
  name: 'extractEntitiesPrompt',
  input: {schema: ExtractEntitiesInputSchema},
  output: {schema: ExtractEntitiesOutputSchema},
  prompt: `Extract named entities from this text. Look for people, places, organizations, dates, and times.
Respond with a JSON object containing an "entities" array. Each entity should have:
- type: "person", "place", "organization", "date", "time", or "other"
- value: the actual entity text found
- relevance: number between 0-1 indicating how relevant/important this entity is

Text to analyze: "{{{userInput}}}"`,
});

export const extractEntitiesFromMessage = ai.defineFlow(
  {
    name: 'extractEntitiesFromMessage',
    inputSchema: ExtractEntitiesInputSchema,
    outputSchema: ExtractEntitiesOutputSchema,
  },
  async input => {
    try {
      const result = await extractEntitiesPrompt(input);
      return result.output!;
    } catch (err) {
      console.error('Error extracting entities:', err);
      throw err;
    }
  }
);