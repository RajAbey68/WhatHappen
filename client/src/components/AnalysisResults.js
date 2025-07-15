import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Divider,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import {
  Message as MessageIcon,
  People as PeopleIcon,
  TrendingUp as TrendingUpIcon,
  EmojiEmotions as EmojiIcon,
  Image as ImageIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';

const COLORS = ['#25D366', '#128C7E', '#34B7F1', '#FF6B6B', '#4ECDC4', '#45B7D1'];

const AnalysisResults = ({ data }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [detailedAnalysis, setDetailedAnalysis] = useState(null);

  useEffect(() => {
    if (data && data.messages) {
      performDetailedAnalysis(data.messages);
    }
  }, [data]);

  const performDetailedAnalysis = (messages) => {
    const analysis = {
      totalMessages: messages.length,
      participants: [...new Set(messages.map(m => m.author))],
      messageTypes: {},
      activityByHour: {},
      activityByDay: {},
      topWords: {},
      mediaCount: 0,
      emojiCount: 0,
      averageMessageLength: 0,
      mostActiveParticipant: null,
      busiestHour: null,
      busiestDay: null
    };

    const participantStats = {};
    let totalLength = 0;

    messages.forEach(message => {
      // Count message types
      const type = message.type || 'text';
      analysis.messageTypes[type] = (analysis.messageTypes[type] || 0) + 1;

      // Activity by hour
      const hour = new Date(message.timestamp).getHours();
      analysis.activityByHour[hour] = (analysis.activityByHour[hour] || 0) + 1;

      // Activity by day
      const day = new Date(message.timestamp).toLocaleDateString('en-US', { weekday: 'long' });
      analysis.activityByDay[day] = (analysis.activityByDay[day] || 0) + 1;

      // Participant stats
      if (!participantStats[message.author]) {
        participantStats[message.author] = { count: 0, totalLength: 0 };
      }
      participantStats[message.author].count++;
      if (message.message) {
        participantStats[message.author].totalLength += message.message.length;
        totalLength += message.message.length;
      }

      // Count media and emojis
      if (type === 'media') analysis.mediaCount++;
      if (message.message && /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(message.message)) {
        analysis.emojiCount++;
      }

      // Top words
      if (message.message && type === 'text') {
        const words = message.message.toLowerCase().match(/\b\w+\b/g) || [];
        words.forEach(word => {
          if (word.length > 2) {
            analysis.topWords[word] = (analysis.topWords[word] || 0) + 1;
          }
        });
      }
    });

    // Calculate averages and find most active
    analysis.averageMessageLength = totalLength / messages.length;
    
    const mostActive = Object.entries(participantStats)
      .sort(([,a], [,b]) => b.count - a.count)[0];
    analysis.mostActiveParticipant = mostActive ? {
      name: mostActive[0],
      messages: mostActive[1].count,
      avgLength: mostActive[1].totalLength / mostActive[1].count
    } : null;

    const busiestHour = Object.entries(analysis.activityByHour)
      .sort(([,a], [,b]) => b - a)[0];
    analysis.busiestHour = busiestHour ? {
      hour: parseInt(busiestHour[0]),
      messages: busiestHour[1]
    } : null;

    const busiestDay = Object.entries(analysis.activityByDay)
      .sort(([,a], [,b]) => b - a)[0];
    analysis.busiestDay = busiestDay ? {
      day: busiestDay[0],
      messages: busiestDay[1]
    } : null;

    // Get top 10 words
    analysis.topWords = Object.entries(analysis.topWords)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});

    setDetailedAnalysis(analysis);
  };

  const formatHour = (hour) => {
    return `${hour}:00`;
  };

  const getHourlyData = () => {
    if (!detailedAnalysis) return [];
    return Object.entries(detailedAnalysis.activityByHour)
      .map(([hour, count]) => ({
        hour: formatHour(parseInt(hour)),
        messages: count
      }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
  };

  const getDailyData = () => {
    if (!detailedAnalysis) return [];
    const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return dayOrder
      .map(day => ({
        day,
        messages: detailedAnalysis.activityByDay[day] || 0
      }));
  };

  const getParticipantData = () => {
    if (!detailedAnalysis) return [];
    return detailedAnalysis.participants.map(participant => ({
      name: participant,
      messages: data.messages.filter(m => m.author === participant).length
    })).sort((a, b) => b.messages - a.messages);
  };

  const getTopWordsData = () => {
    if (!detailedAnalysis) return [];
    return Object.entries(detailedAnalysis.topWords).map(([word, count]) => ({
      word,
      count
    }));
  };

  if (!detailedAnalysis) {
    return <Typography>Loading analysis...</Typography>;
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        📊 Chat Analysis Results
      </Typography>

      {/* Summary Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <MessageIcon color="primary" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h4">{detailedAnalysis.totalMessages}</Typography>
                  <Typography variant="body2" color="text.secondary">Total Messages</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <PeopleIcon color="primary" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h4">{detailedAnalysis.participants.length}</Typography>
                  <Typography variant="body2" color="text.secondary">Participants</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <EmojiIcon color="primary" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h4">{detailedAnalysis.emojiCount}</Typography>
                  <Typography variant="body2" color="text.secondary">Emojis Used</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <ImageIcon color="primary" sx={{ mr: 2 }} />
                <Box>
                  <Typography variant="h4">{detailedAnalysis.mediaCount}</Typography>
                  <Typography variant="body2" color="text.secondary">Media Files</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs for different views */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
          <Tab label="Activity Overview" />
          <Tab label="Participants" />
          <Tab label="Word Analysis" />
          <Tab label="Insights" />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {activeTab === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Activity by Hour</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getHourlyData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="messages" fill="#25D366" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Activity by Day</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getDailyData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="messages" fill="#128C7E" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {activeTab === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Message Distribution</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getParticipantData()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="messages"
                    >
                      {getParticipantData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Participant Stats</Typography>
                <List>
                  {getParticipantData().map((participant, index) => (
                    <ListItem key={participant.name}>
                      <ListItemIcon>
                        <Chip 
                          label={index + 1} 
                          size="small" 
                          color={index === 0 ? "primary" : "default"}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={participant.name}
                        secondary={`${participant.messages} messages`}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {activeTab === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Most Used Words</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getTopWordsData()} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="word" type="category" width={80} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#34B7F1" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Word Frequency</Typography>
                <Box display="flex" flexWrap="wrap" gap={1}>
                  {getTopWordsData().map((wordData, index) => (
                    <Chip
                      key={wordData.word}
                      label={`${wordData.word} (${wordData.count})`}
                      color={index < 3 ? "primary" : "default"}
                      variant={index < 3 ? "filled" : "outlined"}
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {activeTab === 3 && (
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Key Insights</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <List>
                      <ListItem>
                        <ListItemIcon>
                          <TrendingUpIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Most Active Participant"
                          secondary={detailedAnalysis.mostActiveParticipant ? 
                            `${detailedAnalysis.mostActiveParticipant.name} (${detailedAnalysis.mostActiveParticipant.messages} messages)` : 
                            'N/A'
                          }
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <ScheduleIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Busiest Hour"
                          secondary={detailedAnalysis.busiestHour ? 
                            `${formatHour(detailedAnalysis.busiestHour.hour)} (${detailedAnalysis.busiestHour.messages} messages)` : 
                            'N/A'
                          }
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <ScheduleIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Busiest Day"
                          secondary={detailedAnalysis.busiestDay ? 
                            `${detailedAnalysis.busiestDay.day} (${detailedAnalysis.busiestDay.messages} messages)` : 
                            'N/A'
                          }
                        />
                      </ListItem>
                    </List>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <List>
                      <ListItem>
                        <ListItemIcon>
                          <MessageIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Average Message Length"
                          secondary={`${Math.round(detailedAnalysis.averageMessageLength)} characters`}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <EmojiIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Emoji Usage"
                          secondary={`${detailedAnalysis.emojiCount} emojis (${((detailedAnalysis.emojiCount / detailedAnalysis.totalMessages) * 100).toFixed(1)}% of messages)`}
                        />
                      </ListItem>
                      <ListItem>
                        <ListItemIcon>
                          <ImageIcon color="primary" />
                        </ListItemIcon>
                        <ListItemText
                          primary="Media Files"
                          secondary={`${detailedAnalysis.mediaCount} files (${((detailedAnalysis.mediaCount / detailedAnalysis.totalMessages) * 100).toFixed(1)}% of messages)`}
                        />
                      </ListItem>
                    </List>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default AnalysisResults;