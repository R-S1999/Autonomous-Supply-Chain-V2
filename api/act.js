// Vercel serverless function: streams OpenAI chat completions for the Act agent.
// Accepts the key from the request body (user-supplied in the UI) or OPENAI_API_KEY env.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const { apiKey, messages, model } = req.body || {};
  const key = (apiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!key) {
    res.status(400).json({ error: 'no_api_key' });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages required' });
    return;
  }

  let upstream;
  try {
    upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        temperature: 0.4,
        stream: true,
        messages,
      }),
    });
  } catch (err) {
    res.status(502).json({ error: 'upstream_unreachable', detail: String(err) });
    return;
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    res.status(upstream.status).send(text);
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });
  try {
    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
  } catch {
    /* client disconnected */
  }
  res.end();
}
