// server.js
import express from 'express';
import routes from './routes/index.js';

const app = express();

// routes
app.use('/', routes);

const port = process.env.PORT || 5000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${port}`);
});

export default app;
