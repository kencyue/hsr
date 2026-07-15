let cachedToken = null;
let cachedTokenExpiry = 0;

async function getTdxToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiry) {
    return cachedToken;
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.TDX_CLIENT_ID,
    client_secret: process.env.TDX_CLIENT_SECRET
  });

  const res = await fetch(
    'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    }
  );

  if (!res.ok) {
    throw new Error('Failed to fetch TDX token');
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // 提早 60 秒刷新，避免 Token 剛好過期
  const expiresInMs = (data.expires_in ? data.expires_in - 60 : 3600) * 1000;
  cachedTokenExpiry = now + expiresInMs;

  return cachedToken;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { start_station, end_station, train_date, train_time, train_number } = req.body;

  if (!start_station || !end_station || !train_date || !train_time || !train_number) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const token = await getTdxToken();

    const query = new URLSearchParams({
      start_station,
      end_station,
      train_date,
      train_time,
      train_number
    });

    const bookingRes = await fetch(
      `https://tdx.transportdata.tw/api/maas-thsr/booking/deeplink/direct/hsr?${query.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const data = await bookingRes.json();
    res.status(bookingRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Booking request failed', detail: err.message });
  }
}