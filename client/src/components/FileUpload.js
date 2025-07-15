import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Typography,
  Alert,
  LinearProgress,
  Paper,
  IconButton
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Delete as DeleteIcon,
  Description as FileIcon
} from '@mui/icons-material';
import axios from 'axios';

const FileUpload = ({ onUpload, onAnalysisComplete, onError, loading }) => {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (selectedFile) => {
    // Validate file type
    const allowedTypes = ['text/csv', 'text/plain'];
    const allowedExtensions = ['.csv', '.txt'];
    
    const isValidType = allowedTypes.includes(selectedFile.type) ||
      allowedExtensions.some(ext => selectedFile.name.toLowerCase().endsWith(ext));
    
    if (!isValidType) {
      onError('Please select a valid CSV or TXT file');
      return;
    }

    // Validate file size (50MB limit)
    if (selectedFile.size > 50 * 1024 * 1024) {
      onError('File size must be less than 50MB');
      return;
    }

    setFile(selectedFile);
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      onError('Please select a file first');
      return;
    }

    onUpload();
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('chatFile', file);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(progress);
        },
      });

      if (response.data.success) {
        onAnalysisComplete(response.data.data);
      } else {
        onError(response.data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.details || 
                          'Failed to upload file. Please try again.';
      onError(errorMessage);
    }
  };

  const removeFile = () => {
    setFile(null);
    setUploadProgress(0);
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Upload WhatsApp Chat Export
      </Typography>
      
      <Typography variant="body2" color="text.secondary" mb={3}>
        Supported formats: CSV, TXT (max 50MB)
      </Typography>

      {!file ? (
        <Paper
          variant="outlined"
          sx={{
            border: dragActive ? '2px dashed #25D366' : '2px dashed #ccc',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            backgroundColor: dragActive ? 'rgba(37, 211, 102, 0.05)' : 'transparent',
            transition: 'all 0.3s ease',
            cursor: 'pointer',
            '&:hover': {
              borderColor: '#25D366',
              backgroundColor: 'rgba(37, 211, 102, 0.05)',
            }
          }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input').click()}
        >
          <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            {dragActive ? 'Drop your file here' : 'Drag & drop your file here'}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2}>
            or click to browse
          </Typography>
          <Button
            variant="contained"
            component="span"
            disabled={loading}
          >
            Choose File
          </Button>
          <input
            id="file-input"
            type="file"
            accept=".csv,.txt"
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, mb: 2 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center">
              <FileIcon sx={{ mr: 2, color: 'primary.main' }} />
              <Box>
                <Typography variant="subtitle1" fontWeight="medium">
                  {file.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </Typography>
              </Box>
            </Box>
            <IconButton onClick={removeFile} disabled={loading}>
              <DeleteIcon />
            </IconButton>
          </Box>
          
          {uploadProgress > 0 && uploadProgress < 100 && (
            <Box mt={2}>
              <LinearProgress 
                variant="determinate" 
                value={uploadProgress} 
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" color="text.secondary" mt={1}>
                Uploading... {uploadProgress}%
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {file && (
        <Box display="flex" gap={2} mt={2}>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={loading}
            sx={{ minWidth: 120 }}
          >
            {loading ? 'Analyzing...' : 'Analyze Chat'}
          </Button>
          <Button
            variant="outlined"
            onClick={removeFile}
            disabled={loading}
          >
            Remove File
          </Button>
        </Box>
      )}

      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>How to export WhatsApp chats:</strong><br />
          1. Open WhatsApp and go to the chat you want to export<br />
          2. Tap the three dots menu → More → Export chat<br />
          3. Choose "Without media" to get a smaller file<br />
          4. Upload the exported file here for analysis
        </Typography>
      </Alert>
    </Box>
  );
};

export default FileUpload;