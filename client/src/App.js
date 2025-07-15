import React, { useState } from 'react';
import {
  Container,
  Box,
  Typography,
  Paper,
  ThemeProvider,
  createTheme,
  CssBaseline,
  Alert,
  CircularProgress
} from '@mui/material';
import FileUpload from './components/FileUpload';
import AnalysisResults from './components/AnalysisResults';
import './App.css';

const theme = createTheme({
  palette: {
    primary: {
      main: '#25D366', // WhatsApp green
    },
    secondary: {
      main: '#128C7E',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h4: {
      fontWeight: 600,
    },
  },
});

function App() {
  const [analysisData, setAnalysisData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAnalysisComplete = (data) => {
    setAnalysisData(data);
    setLoading(false);
    setError(null);
  };

  const handleError = (errorMessage) => {
    setError(errorMessage);
    setLoading(false);
    setAnalysisData(null);
  };

  const handleFileUpload = () => {
    setLoading(true);
    setError(null);
    setAnalysisData(null);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box textAlign="center" mb={4}>
          <Typography variant="h4" component="h1" gutterBottom color="primary">
            📊 WhatHappen
          </Typography>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            WhatsApp Export Analysis Tool
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Upload your WhatsApp chat export to get detailed insights and analytics
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Paper elevation={3} sx={{ p: 4, mb: 4 }}>
          <FileUpload
            onUpload={handleFileUpload}
            onAnalysisComplete={handleAnalysisComplete}
            onError={handleError}
            loading={loading}
          />
        </Paper>

        {loading && (
          <Box display="flex" justifyContent="center" my={4}>
            <CircularProgress size={60} />
          </Box>
        )}

        {analysisData && (
          <Paper elevation={3} sx={{ p: 4 }}>
            <AnalysisResults data={analysisData} />
          </Paper>
        )}
      </Container>
    </ThemeProvider>
  );
}

export default App;
