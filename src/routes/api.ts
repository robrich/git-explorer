import express from 'express';
import config from '../../env.json';
// { gitRepo: 'path to the directory with git repo (not to the .git folder, to the parent dir)' }

import { getBlobContents, getNodes } from '../gitter';

const router = express.Router();

router.get('/commits', async (req, res, next) => {
  try {
    // we could cache this to make it faster but we probably want to refresh on each change
    const json = await getNodes(config.gitRepo);
    res.setHeader('Last-Modified', (new Date()).toUTCString()); // avoid '304 not modified'
    res.json(json);
  } catch (err) {
    next(err);
  }
});

router.get('/blob/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const content = await getBlobContents(config.gitRepo, id);
    res.set('Content-Type', 'text/plain');
    res.send(content).end();
} catch (err) {
  next(err);
}
});

export default router;
