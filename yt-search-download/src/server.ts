import express from 'express';
import cors from 'cors';
import { router } from './routes';

const app = express();

app.use(cors()); // Allow all
app.use(router);

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
