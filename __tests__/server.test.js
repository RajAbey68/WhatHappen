const request = require('supertest');
const app = require('../server');
const fs = require('fs-extra');
const path = require('path');

describe('Server API', () => {
  beforeAll(async () => {
    // Ensure test directories exist
    await fs.ensureDir('logs');
    await fs.ensureDir('uploads');
  });

  afterAll(async () => {
    // Clean up test files
    await fs.remove('logs');
    await fs.remove('uploads');
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('POST /api/upload', () => {
    it('should reject request without file', async () => {
      const response = await request(app)
        .post('/api/upload')
        .expect(400);

      expect(response.body).toHaveProperty('error', 'No file uploaded');
    });

    it('should reject invalid file types', async () => {
      const response = await request(app)
        .post('/api/upload')
        .attach('chatFile', Buffer.from('test'), 'test.pdf')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should accept valid CSV file', async () => {
      const csvContent = 'Date,Time,Author,Message\n01/01/2023,12:00:00,John,Hello\n01/01/2023,12:01:00,Jane,Hi there';
      
      const response = await request(app)
        .post('/api/upload')
        .attach('chatFile', Buffer.from(csvContent), 'test.csv')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('totalMessages');
      expect(response.body.data).toHaveProperty('participants');
    });
  });

  describe('POST /api/analyze', () => {
    it('should reject request without messages', async () => {
      const response = await request(app)
        .post('/api/analyze')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid messages data');
    });

    it('should analyze valid message data', async () => {
      const messages = [
        {
          timestamp: new Date('2023-01-01T12:00:00Z'),
          author: 'John',
          message: 'Hello world!',
          type: 'text'
        },
        {
          timestamp: new Date('2023-01-01T12:01:00Z'),
          author: 'Jane',
          message: 'Hi there! 😊',
          type: 'text'
        }
      ];

      const response = await request(app)
        .post('/api/analyze')
        .send({ messages })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('totalMessages', 2);
      expect(response.body.data).toHaveProperty('participants');
      expect(response.body.data.participants).toHaveLength(2);
    });
  });

  describe('Error handling', () => {
    it('should handle 404 routes', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
    });
  });
});