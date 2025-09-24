export default async function handler(req, res) {
  res.setHeader('Allow', ['GET']);
  return res.status(410).json({ error: 'SSE disabled on Hobby plan. Use admin-dashboard actions for updates.' });
}


