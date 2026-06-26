const https = require('https');

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Request galat hai' }) };
  }

  const { imageBase64 } = body;
  const HF_TOKEN = process.env.HF_TOKEN;

  if (!HF_TOKEN) return {
    statusCode: 500, headers,
    body: JSON.stringify({ error: 'HF_TOKEN set nahi — Netlify environment variables check karo' })
  };

  if (!imageBase64) return {
    statusCode: 400, headers,
    body: JSON.stringify({ error: 'Image nahi mili' })
  };

  try {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Using SVD-XT with 25 frames = ~10 seconds at 2.5fps
    const response = await makeRequest(
      'https://api-inference.huggingface.co/models/stabilityai/stable-video-diffusion-img2vid-xt',
      imageBuffer,
      HF_TOKEN
    );

    if (!response.ok) {
      let msg = 'Video generate nahi hui';
      if (response.status === 503) msg = 'AI Model busy hai — 2 minute baad try karo';
      if (response.status === 401) msg = 'HF Token galat hai — Netlify mein sahi token daalo';
      if (response.status === 400) msg = 'Image format sahi nahi — JPG ya PNG use karo';
      return { 
        statusCode: response.status, 
        headers, 
        body: JSON.stringify({ error: msg }) 
      };
    }

    const videoData = response.data;
    return {
      statusCode: 200,
      headers: { 
        ...headers, 
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="vidgen-10sec.mp4"'
      },
      body: videoData.toString('base64'),
      isBase64Encoded: true,
    };

  } catch(e) {
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Server error: ' + e.message }) 
    };
  }
};

function makeRequest(url, imageBuffer, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'image/jpeg',
        'Content-Length': imageBuffer.length,
        'X-Wait-For-Model': 'true',
      },
      timeout: 120000,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const data = Buffer.concat(chunks);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          data: data,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout — dobara try karo'));
    });

    req.write(imageBuffer);
    req.end();
  });
}
