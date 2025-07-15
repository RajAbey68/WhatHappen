# 📊 WhatHappen - WhatsApp Export Analysis Tool

A comprehensive web application for analyzing WhatsApp chat exports with detailed insights, statistics, and visualizations.

## ✨ Features

- **File Upload**: Drag & drop support for CSV and TXT files
- **Comprehensive Analysis**: Message statistics, participant analysis, activity patterns
- **Interactive Visualizations**: Charts and graphs for data insights
- **Real-time Processing**: Fast analysis with progress indicators
- **Responsive Design**: Works on desktop and mobile devices
- **Security**: File validation, rate limiting, and secure file handling

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Docker (optional, for containerized deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd whathappen
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the development servers**
   ```bash
   # Terminal 1: Start backend server
   npm run dev
   
   # Terminal 2: Start frontend development server
   cd client && npm start
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

### Docker Deployment

1. **Build and run with Docker Compose**
   ```bash
   docker-compose up --build
   ```

2. **Access the application**
   - Application: http://localhost:3001

### Production Deployment

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start production server**
   ```bash
   npm start
   ```

## 📁 Project Structure

```
whathappen/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── App.js         # Main app component
│   │   └── index.js       # Entry point
│   ├── package.json       # Frontend dependencies
│   └── public/            # Static assets
├── server.js              # Express backend server
├── package.json           # Backend dependencies
├── Dockerfile             # Docker configuration
├── docker-compose.yml     # Docker Compose setup
├── .env.example           # Environment variables template
└── README.md              # This file
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `NODE_ENV` | Environment mode | `development` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |
| `LOG_LEVEL` | Logging level | `info` |
| `MAX_FILE_SIZE` | Maximum file size (bytes) | `52428800` (50MB) |

### API Endpoints

- `GET /api/health` - Health check
- `POST /api/upload` - Upload and analyze chat file
- `POST /api/analyze` - Analyze message data

## 📊 Analysis Features

### Message Statistics
- Total message count
- Participant analysis
- Message type distribution
- Average message length

### Activity Patterns
- Hourly activity charts
- Daily activity patterns
- Busiest hours and days
- Participant engagement

### Content Analysis
- Most used words
- Emoji usage statistics
- Media file counts
- Message frequency trends

### Visualizations
- Bar charts for activity patterns
- Pie charts for participant distribution
- Word frequency analysis
- Interactive data exploration

## 🛠️ Development

### Available Scripts

```bash
# Install all dependencies
npm run install:all

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Adding New Features

1. **Backend**: Add new routes in `server.js`
2. **Frontend**: Create components in `client/src/components/`
3. **Styling**: Use Material-UI components and theme
4. **Charts**: Use Recharts library for visualizations

## 🔒 Security Features

- **File Validation**: Type and size checking
- **Rate Limiting**: API request throttling
- **CORS Protection**: Cross-origin request control
- **Input Sanitization**: Data validation and cleaning
- **Secure Headers**: Helmet.js security middleware
- **Error Handling**: Comprehensive error management

## 🐛 Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   # Kill process using port 3001
   lsof -ti:3001 | xargs kill -9
   ```

2. **File upload fails**
   - Check file size (max 50MB)
   - Ensure file is CSV or TXT format
   - Verify file encoding (UTF-8 recommended)

3. **Build errors**
   ```bash
   # Clear cache and reinstall
   rm -rf node_modules client/node_modules
   npm run install:all
   ```

4. **Docker issues**
   ```bash
   # Rebuild containers
   docker-compose down
   docker-compose up --build
   ```

### Logs

- Application logs: `logs/combined.log`
- Error logs: `logs/error.log`
- Docker logs: `docker-compose logs whathappen`

## 📈 Performance

- **File Processing**: Optimized for large chat exports
- **Memory Usage**: Efficient data handling
- **Response Time**: Fast analysis with progress indicators
- **Scalability**: Containerized deployment ready

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the documentation

---

**WhatHappen** - Making WhatsApp chat analysis simple and insightful! 📱✨
