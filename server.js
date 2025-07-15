const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const csv = require('csv-parser');
const moment = require('moment');
const winston = require('winston');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'whathappen-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Ensure logs directory exists
fs.ensureDirSync('logs');

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL, 'https://yourdomain.com'] 
    : ['http://localhost:3000'],
  credentials: true
}));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    fs.ensureDirSync(uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.txt')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and TXT files are allowed'), false);
    }
  }
});

// Utility function to parse WhatsApp export
function parseWhatsAppExport(filePath) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const participants = new Set();
    const datePattern = /\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\]/;
    const messagePattern = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\]\s*(.+?):\s*(.+)$/;

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Handle CSV format
        if (row.Date && row.Time && row.Author && row.Message) {
          const dateTime = `${row.Date} ${row.Time}`;
          const timestamp = moment(dateTime, 'DD/MM/YYYY HH:mm:ss').toDate();
          
          messages.push({
            timestamp,
            author: row.Author,
            message: row.Message,
            type: 'text'
          });
          
          participants.add(row.Author);
        }
      })
      .on('end', () => {
        if (messages.length === 0) {
          // Try parsing as text file
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const lines = fileContent.split('\n');
          
          lines.forEach(line => {
            const match = line.match(messagePattern);
            if (match) {
              const [, date, time, author, message] = match;
              const dateTime = `${date} ${time}`;
              const timestamp = moment(dateTime, 'DD/MM/YYYY HH:mm:ss').toDate();
              
              messages.push({
                timestamp,
                author,
                message,
                type: 'text'
              });
              
              participants.add(author);
            }
          });
        }
        
        resolve({
          messages,
          participants: Array.from(participants),
          totalMessages: messages.length,
          dateRange: {
            start: messages.length > 0 ? Math.min(...messages.map(m => m.timestamp)) : null,
            end: messages.length > 0 ? Math.max(...messages.map(m => m.timestamp)) : null
          }
        });
      })
      .on('error', reject);
  });
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.post('/api/upload', upload.single('chatFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    logger.info(`File uploaded: ${req.file.originalname}`);

    const analysis = await parseWhatsAppExport(req.file.path);
    
    // Clean up uploaded file
    await fs.remove(req.file.path);

    res.json({
      success: true,
      data: analysis,
      message: 'File analyzed successfully'
    });

  } catch (error) {
    logger.error('Error processing file:', error);
    res.status(500).json({ 
      error: 'Error processing file',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Error handling for multer file filter errors
app.use((error, req, res, next) => {
  if (error.message === 'Only CSV and TXT files are allowed') {
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid messages data' });
    }

    // Perform detailed analysis
    const analysis = {
      totalMessages: messages.length,
      participants: [...new Set(messages.map(m => m.author))],
      messageTypes: {},
      activityByHour: {},
      activityByDay: {},
      topWords: {},
      mediaCount: 0,
      emojiCount: 0
    };

    messages.forEach(message => {
      // Count message types
      const type = message.type || 'text';
      analysis.messageTypes[type] = (analysis.messageTypes[type] || 0) + 1;

      // Activity by hour
      const hour = moment(message.timestamp).format('HH');
      analysis.activityByHour[hour] = (analysis.activityByHour[hour] || 0) + 1;

      // Activity by day
      const day = moment(message.timestamp).format('dddd');
      analysis.activityByDay[day] = (analysis.activityByDay[day] || 0) + 1;

      // Count media and emojis
      if (type === 'media') analysis.mediaCount++;
      if (message.message && /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(message.message)) {
        analysis.emojiCount++;
      }

      // Top words (simple implementation)
      if (message.message && type === 'text') {
        const words = message.message.toLowerCase().match(/\b\w+\b/g) || [];
        words.forEach(word => {
          if (word.length > 2) {
            analysis.topWords[word] = (analysis.topWords[word] || 0) + 1;
          }
        });
      }
    });

    // Get top 10 words
    analysis.topWords = Object.entries(analysis.topWords)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});

    res.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    logger.error('Error analyzing messages:', error);
    res.status(500).json({ 
      error: 'Error analyzing messages',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`🚀 WhatHappen server running on port ${PORT}`);
  console.log(`📊 WhatsApp Export Analysis Tool`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;