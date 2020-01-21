import express from 'express';
import logger from 'morgan';
import { join } from 'path';

import apiRouter from './routes/api';
import indexRouter from './routes/index';

const app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(join(__dirname, '../public')));

app.use('/', indexRouter);
app.use('/api', apiRouter);

export default app;
