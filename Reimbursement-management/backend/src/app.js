const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');
const { configurePassport, passport } = require('./config/passport');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
configurePassport();

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));
app.use(passport.initialize());

app.get('/', (req, res) => {
  res.send('Reimbursement backend is running');
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;