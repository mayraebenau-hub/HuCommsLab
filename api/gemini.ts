import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, contents, config } = req.body;

    if (!model || !contents) {
      return res.status(400).json({ error: 'Missing model or contents' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const response = await ai.models.generateContent({
      model,
      contents,
      config,
    });

    // Return the parts the client needs: text, functionCalls, and candidates
    return res.status(200).json({
      text: response.text,
      functionCalls: response.functionCalls || null,
      candidates: response.candidates,
    });
  } catch (error: any) {
    console.error('Gemini proxy error:', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Gemini API call failed',
    });
  }
}
