import { Router } from 'express';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { mkdirSync, unlinkSync } from 'fs';
import { requireAuth } from '../middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = join(__dirname, '..', 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, _file, cb) => {
    // Use the path sent by the client (last segment) or generate a unique name
    const pathSegments = (req.body.path || '').split('/');
    const name = pathSegments[pathSegments.length - 1] || `${Date.now()}${extname(_file.originalname)}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  },
});

const router = Router();

router.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  res.json({ success: true, filename: req.file.filename });
});

router.post('/delete', requireAuth, (req, res) => {
  const { paths = [] } = req.body;
  for (const p of paths) {
    try {
      // Only allow filenames, not directory traversal
      const filename = p.split('/').pop();
      unlinkSync(join(UPLOADS_DIR, filename));
    } catch {
      // ignore missing files
    }
  }
  res.json({ success: true });
});

export default router;
