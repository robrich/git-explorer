import express from 'express';
import { join } from 'path';

const router = express.Router();

/* GET home page. */
router.get('/', (req, res, next) => {
  res.sendFile(join(__dirname, '/../../public/index.html'));
});

export default router;
