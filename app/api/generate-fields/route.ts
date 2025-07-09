import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  // We will wrap the entire function in a try...catch block
  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
          { error: 'Prompt is required' },
          { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // We are returning a more specific error message now
      return NextResponse.json(
          { error: 'The OPENAI_API_KEY environment variable is not set on the server.' },
          { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are an expert at creating structured field definitions. Based on the user's request, generate a JSON object with two keys: "fields" (an array of objects, where each object has 'displayName', 'description', and 'type') and "interpretation" (a string explaining your choices).`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: 'json_object' },
    });

    const messageContent = completion.choices[0].message.content;

    if (!messageContent) {
      throw new Error('No response content from OpenAI');
    }

    const parsed = JSON.parse(messageContent);

    return NextResponse.json({
      success: true,
      data: parsed,
    });

  } catch (error) {
    // --- THIS IS THE IMPORTANT PART ---
    // We are now sending the detailed error back to the browser.
    console.error('--- SERVER-SIDE ERROR ---', error);
    return NextResponse.json(
        {
          error: 'An unexpected error occurred on the server.',
          // We include the actual error details in the response
          details: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        },
        { status: 500 }
    );
  }
}