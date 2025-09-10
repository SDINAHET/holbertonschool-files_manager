// server.js
import express from 'express';
import routes from './routes/index';

const app = express();

// routes
app.use(express.json()); // <-- nécessaire pour lire req.body JSON  task3
app.use('/', routes);

const port = process.env.PORT || 5000;
// lier explicitement sur 127.0.0.1 (compatible checker) ET 0.0.0.0 si besoin
const HOST = process.env.HOST || '127.0.0.1';

app.listen(port, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${port}`);
});

export default app;
