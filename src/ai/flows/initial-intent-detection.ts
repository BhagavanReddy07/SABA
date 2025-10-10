import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const IntentDetectionInputSchema = z.object({
  userInput: z.string().describe('The user input text to analyze.'),
});

const IntentDetectionOutputSchema = z.object({
  intent: z.enum(['Create Task', 'Get Information', 'Chit-Chat', 'Unknown'])
    .describe('The detected intent of the user input'),
});

const detectIntentPrompt = ai.definePrompt({
  name: 'detectIntentPrompt',
  input: {schema: IntentDetectionInputSchema},
  output: {schema: IntentDetectionOutputSchema},
  prompt: `Given this user input, determine their intent. Respond with a JSON object containing just the "intent" field.
User input: "{{{userInput}}}"

The intent must be one of:
- "Create Task": User wants to create a task, reminder, or alarm
- "Get Information": User is asking a question or seeking information
- "Chit-Chat": User is making casual conversation
- "Unknown": Intent is unclear or none of the above`
});

export const detectInitialIntent = ai.defineFlow(
  {
    name: 'detectInitialIntent',
    inputSchema: IntentDetectionInputSchema,
    outputSchema: IntentDetectionOutputSchema,
  },
  async input => {
    try {
      const result = await detectIntentPrompt(input);
      return result.output!;
    } catch (err) {
      console.error('Error detecting intent:', err);
      throw err;
    }
  }
);