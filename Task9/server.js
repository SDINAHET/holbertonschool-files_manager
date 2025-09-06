import express from 'express';
import router from './index.js';

const app = express();
const port = process.env.PORT || 5000;

// Middleware pour parser JSON
app.use(express.json({ limit: '50mb' }));

// Utiliser le router
app.use('/', router);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
