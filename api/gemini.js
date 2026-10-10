// Vercel serverless function: POST /api/gemini
// Set GEMINI_API_KEY in Vercel Project Settings > Environment Variables.
const MODEL = 'gemini-2.5-flash';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'The server is not configured with a Gemini API key.' });
  }

  try {
    const body = req.body || {};
    const name = clean(body.name, 100) || 'unknown name';
    const age = clean(body.age, 3);
    const gender = clean(body.gender, 30) || 'gender unknown';
    const symptoms = clean(body.symptoms, 3000);
    const city = clean(body.city, 120);
    const marks = Array.isArray(body.marks)
      ? body.marks.slice(0, 8).map(x => clean(x, 80)).filter(Boolean)
      : [];

    if (!symptoms || !city) {
      return res.status(400).json({ error: 'Please provide symptoms and a city.' });
    }

    const who = `${name}, ${age ? age + ' years old' : 'age unknown'}, ${gender}`;
    const prompt = `You are a careful health-information assistant. You never diagnose.
Patient: ${who}.
Symptoms: "${symptoms}"
${marks.length ? "The patient marked these spots on a body diagram (patient's own left/right): " + [...new Set(marks)].join(', ') + '. Take the exact locations into account.\n' : ''}City: "${city}"

Use Google Search to find 2-4 real hospitals in or near that city, preferring ones with emergency departments.
Reply with ONLY a JSON object (no markdown fences) with these keys:
"urgency": "emergency" | "urgent" | "routine"
"note": 1-2 sentences on how typical this symptom combination is for this age and gender, and why evaluation matters
"regions": array of affected body areas, from ["head","chest","abdomen","left_arm","right_arm","legs"] (use [] if the patient marked locations)
"causes": 3-5 short strings, most concerning first
"roadmap": 3-5 short strings (checks or tests a clinician may do)
"wellness": 1-2 sentences of safe self-care; if urgency is "emergency", start with "Seek immediate care."
"hospitals": array of {"name": string, "area": string}`;

    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }]
        })
      }
    );

    const data = await upstream.json();
    if (!upstream.ok) {
      // Do not send the secret or full upstream details to the browser.
      console.error('Gemini request failed with status:', upstream.status);
      return res.status(502).json({ error: 'The Gemini service could not complete the request. Please try again later.' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  } catch (err) {
    console.error('MediMitra API error:', err?.message || 'Unknown error');
    return res.status(500).json({ error: 'An unexpected server error occurred. Please try again.' });
  }
};

function clean(value, maxLength) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().slice(0, maxLength);
}
