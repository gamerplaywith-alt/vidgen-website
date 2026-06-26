export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Sirf POST allowed hai' });

  const { imageBase64, prompt } = req.body;
  const HF_TOKEN = process.env.HF_TOKEN;

  if (!HF_TOKEN) return res.status(500).json({ error: 'Server pe HF_TOKEN set nahi hai' });
  if (!imageBase64) return res.status(400).json({ error: 'Image nahi mili' });

  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const hfRes = await fetch(
      'https://api-inference.huggingface.co/models/stabilityai/stable-video-diffusion-img2vid-xt',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'image/jpeg',
          'X-Wait-For-Model': 'true',
        },
        body: imageBuffer,
      }
    );

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      let msg = 'Video generate nahi hui';
      if (hfRes.status === 503) msg = 'AI Model abhi busy hai — thodi der baad try karo';
      if (hfRes.status === 401) msg = 'HF Token galat hai — Vercel mein sahi token daalo';
      return res.status(hfRes.status).json({ error: msg, detail: errText });
    }

    const videoBuffer = await hfRes.arrayBuffer();
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="vidgen.mp4"');
    return res.status(200).send(Buffer.from(videoBuffer));

  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}
