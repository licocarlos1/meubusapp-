import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email !== 'licocarlos@gmail.com') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador oficial.' });
  }

  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Acesso negado. Senha incorreta.' });
  }

  const token = jwt.sign({ email, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { email } });
});

router.get('/session', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.json({ session: null });
  }
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ session: { user: { email: payload.email } } });
  } catch {
    res.json({ session: null });
  }
});

router.post('/logout', (_req, res) => {
  res.json({ success: true });
});

export default router;
