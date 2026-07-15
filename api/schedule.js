// api/schedule.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { start_station_no, end_station_no, query_date, query_time } = req.body;

    // 1. 取得 TDX Token
    const tokenRes = await fetch('https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.TDX_CLIENT_ID,
        client_secret: process.env.TDX_CLIENT_SECRET
      }).toString()
    });
    
    if (!tokenRes.ok) throw new Error('Failed to fetch TDX Token');
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    // 2. 查詢該日所有班次
    const tdxRes = await fetch(`https://tdx.transportdata.tw/api/basic/v2/Rail/THSR/DailyTimetable/TrainDate/${query_date}?$format=JSON`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const trains = await tdxRes.json();

    // 3. TDX 車站代碼對照表
    const tdxStationIds = {
      1: '0990', 2: '1000', 3: '1010', 4: '1020', 5: '1030', 6: '1040',
      7: '1050', 8: '1060', 9: '1070', 10: '1080', 11: '1090', 12: '0980'
    };

    const startId = tdxStationIds[start_station_no];
    const endId = tdxStationIds[end_station_no];
    let results = [];

    // 4. 過濾與格式轉換
    for (const train of trains) {
      const stops = train.StopTimes;
      const startStop = stops.find(s => s.StationID === startId);
      const endStop = stops.find(s => s.StationID === endId);

      // 確認該車次有停靠起訖站，且方向正確
      if (startStop && endStop && startStop.StopSequence < endStop.StopSequence) {
        // 確認發車時間晚於查詢時間
        if (startStop.DepartureTime >= query_time) {
          results.push({
            id: train.DailyTrainInfo.TrainNo,
            departure_time: startStop.DepartureTime,
            destination_time: endStop.ArrivalTime,
            // 轉換給電視牆畫圓點用的陣列
            station_info: stops.map(s => {
              const localIdStr = Object.keys(tdxStationIds).find(k => tdxStationIds[k] === s.StationID);
              return {
                station_no: parseInt(localIdStr),
                departure_time: s.DepartureTime
              };
            })
          });
        }
      }
    }

    // 依出發時間排序
    results.sort((a, b) => a.departure_time.localeCompare(b.departure_time));

    res.status(200).json({ train_item: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}