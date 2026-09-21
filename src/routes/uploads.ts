import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Create sample placeholder files if they don't exist
const sampleMathPdf = path.join(UPLOADS_DIR, 'sample_math.pdf');
if (!fs.existsSync(sampleMathPdf)) {
  fs.writeFileSync(sampleMathPdf, '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000102 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF');
}
const samplePhysicsDoc = path.join(UPLOADS_DIR, 'sample_physics.docx');
if (!fs.existsSync(samplePhysicsDoc)) {
  fs.writeFileSync(samplePhysicsDoc, 'TaskMe Sample Physics Document Content');
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (_req, file, cb) => {
    const allowedExts = ['.pdf', '.docx', '.pptx', '.doc', '.ppt', '.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận các định dạng tệp: PDF, DOCX, PPTX, hình ảnh (PNG, JPG)'));
    }
  }
});

export const uploadRouter = Router();

uploadRouter.use(authMiddleware);

uploadRouter.post('/', upload.single('file'), (req: AuthenticatedRequest, res: Response): void => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Không tìm thấy tệp tải lên' });
      return;
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      message: 'Tải tệp lên thành công',
      fileName: req.file.originalname,
      fileUrl,
      fileSize: req.file.size
    });
  } catch (err: any) {
    console.error('Upload file error:', err);
    res.status(500).json({ error: err.message || 'Lỗi khi tải tệp lên' });
  }
});
