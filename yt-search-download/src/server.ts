import express from 'express';
import { router } from './routes';

const app = express();
app.use(router);
// allow all cors
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  next();
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
