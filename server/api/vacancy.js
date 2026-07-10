/**
 * 空室・最低価格プロキシ(雛形・未接続)
 * Vercel Serverless Function 形式。楽天トラベル VacantHotelSearch API を
 * キー秘匿+キャッシュ付きで中継する。
 *
 * 必要な環境変数: RAKUTEN_APP_ID(楽天ウェブサービスのアプリID)
 *
 * GET /api/vacancy?hotelNo=79294&checkin=2026-08-01&checkout=2026-08-02&adults=2
 */
const RAKUTEN_ENDPOINT =
  'https://openapi.rakuten.co.jp/engine/api/Travel/VacantHotelSearch/20170426';

module.exports = async function handler(req, res) {
  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) {
    res.status(503).json({ error: 'RAKUTEN_APP_ID is not configured' });
    return;
  }

  const { hotelNo, checkin, checkout, adults } = req.query || {};
  if (!hotelNo || !checkin || !checkout) {
    res.status(400).json({ error: 'hotelNo, checkin, checkout are required' });
    return;
  }

  const params = new URLSearchParams({
    applicationId: appId,
    format: 'json',
    hotelNo: String(hotelNo),
    checkinDate: String(checkin),
    checkoutDate: String(checkout),
    adultNum: String(adults || 2),
  });

  try {
    const upstream = await fetch(RAKUTEN_ENDPOINT + '?' + params.toString());
    const data = await upstream.json();

    // 必要最小限に整形(最低価格・プラン数のみ)
    let minCharge = null;
    let planCount = 0;
    const hotels = (data && data.hotels) || [];
    hotels.forEach((h) => {
      (h.hotel || []).forEach((part) => {
        if (part.roomInfo) {
          planCount += 1;
          part.roomInfo.forEach((r) => {
            const total = r.dailyCharge && r.dailyCharge.total;
            if (typeof total === 'number' && (minCharge === null || total < minCharge)) {
              minCharge = total;
            }
          });
        }
      });
    });

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800'); // 15分キャッシュ
    res.status(200).json({ hotelNo: Number(hotelNo), checkin, checkout, minCharge, planCount });
  } catch (e) {
    res.status(502).json({ error: 'upstream_error' });
  }
};
