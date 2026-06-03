// Simple AFINN-165 based sentiment engine for browser Web Worker compatibility
const AFINN = {
  "happy": 3, "good": 3, "love": 4, "great": 3, "amazing": 4, "awesome": 4, "excellent": 3,
  "delight": 3, "joy": 3, "excited": 3, "glad": 3, "smile": 2, "fun": 4, "laugh": 1,
  "bad": -3, "sad": -2, "hate": -3, "terrible": -4, "awful": -3, "worst": -3, "fail": -2,
  "depressed": -2, "disappointed": -2, "anger": -3, "angry": -3, "kill": -3, "pain": -2,
  "thanks": 2, "thank": 2, "nice": 2, "super": 3, "cool": 1, "perfect": 3, "won": 3,
  "sorry": -1, "hurt": -2, "worry": -3, "fear": -2, "loss": -3, "crying": -2, "ugly": -3
};

function analyzeSentiment(text) {
  const tokens = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
  let score = 0;
  let words = [];
  let positive = [];
  let negative = [];

  for (const token of tokens) {
    if (AFINN[token] !== undefined) {
      const val = AFINN[token];
      score += val;
      words.push(token);
      if (val > 0) positive.push(token);
      else negative.push(token);
    }
  }

  const comparative = tokens.length > 0 ? score / tokens.length : 0;
  return { score, comparative, tokens, words, positive, negative };
}

const STOPWORDS = new Set([
  'the', 'and', 'you', 'that', 'this', 'have', 'with', 'just', 'like', 'what',
  'your', 'will', 'here', 'there', 'about', 'some', 'they', 'them', 'for', 'but',
  'not', 'are', 'was', 'were', 'had', 'has', 'can', 'out', 'all', 'one', 'get',
  'would', 'their', 'from', 'she', 'him', 'her', 'his', 'how', 'who', 'why',
  'when', 'where', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if',
  'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with',
  'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now', 'cant',
  'dont', 'shouldnt', 'wont', 'ive', 'im', 'youre', 'theyre', 'weve', 'hes',
  'shes', 'its', 'thats', 'wasnt', 'werent', 'hasnt', 'hadnt', 'didnt', 'doesnt',
  'arent', 'isnt', 'havent'
]);

self.onmessage = function (e) {
  const { fileContent, fileName } = e.data;
  
  if (!fileContent) {
    self.postMessage({ type: 'error', error: 'No file content to parse' });
    return;
  }

  try {
    const messages = [];
    const lines = fileContent.split('\n');
    const totalLines = lines.length;

    // WhatsApp message patterns
    const messagePattern = /^\[(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\]\s*([^:]+):\s*(.*)$/i;
    const altPattern = /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)\s*-\s*([^:]+):\s*(.*)$/i;

    // Auto-detect locale
    let detectedLocale = 'DMY';
    for (let i = 0; i < Math.min(lines.length, 1000); i++) {
      const trimmed = lines[i].trim();
      const match = trimmed.match(messagePattern) || trimmed.match(altPattern);
      if (match) {
        const dateStr = match[1];
        const parts = dateStr.split(/[\/\-\.]/).map(Number);
        if (parts.length >= 2) {
          if (parts[0] > 12 && parts[1] <= 12) {
            detectedLocale = 'DMY';
            break;
          } else if (parts[1] > 12 && parts[0] <= 12) {
            detectedLocale = 'MDY';
            break;
          }
        }
      }
    }

    let currentMessage = null;
    let lastProgressTime = Date.now();

    for (let i = 0; i < totalLines; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Report progress periodically (every 100ms or 5000 lines)
      if (i % 5000 === 0 || Date.now() - lastProgressTime > 100) {
        self.postMessage({
          type: 'progress',
          parsed: i,
          total: totalLines,
          percent: Math.round((i / totalLines) * 100)
        });
        lastProgressTime = Date.now();
      }

      let match = trimmedLine.match(messagePattern) || trimmedLine.match(altPattern);
      
      if (match) {
        if (currentMessage) {
          messages.push(currentMessage);
        }

        const [, dateStr, timeStr, sender, message] = match;
        
        try {
          const parts = dateStr.split(/[\/\-\.]/).map(Number);
          let day = 1, month = 1, year = 2025;
          if (parts.length === 3) {
            let part1 = parts[0];
            let part2 = parts[1];
            let part3 = parts[2];

            if (part3 < 100) {
              part3 += 2000;
            }

            if (detectedLocale === 'MDY') {
              month = part1;
              day = part2;
              year = part3;
            } else {
              day = part1;
              month = part2;
              year = part3;
            }
          }
          
          let hours = 0, minutes = 0, seconds = 0;
          const isPM = timeStr.toLowerCase().includes('pm');
          const isAM = timeStr.toLowerCase().includes('am');
          const timeClean = timeStr.replace(/\s*[AP]M/i, '').trim();
          const timeParts = timeClean.split(':').map(Number);
          
          if (timeParts.length >= 2) {
            hours = timeParts[0];
            minutes = timeParts[1];
            if (timeParts.length >= 3) {
              seconds = timeParts[2];
            }
            if (isPM && hours < 12) {
              hours += 12;
            } else if (isAM && hours === 12) {
              hours = 0;
            }
          }
          
          const timestamp = new Date(year, month - 1, day, hours, minutes, seconds).toISOString();
          
          let messageType = 'text';
          if (message.includes('<Media omitted>') || message.includes('image omitted') || message.includes('video omitted')) {
            messageType = 'media';
          } else if (message.includes('added') || message.includes('left') || message.includes('changed')) {
            messageType = 'system';
          }

          let sentimentAnalysis = null;
          if (messageType === 'text') {
            sentimentAnalysis = analyzeSentiment(message);
          }

          currentMessage = {
            timestamp,
            sender: sender.trim(),
            message: message.trim(),
            messageType,
            sentiment: sentimentAnalysis
          };
        } catch (error) {
          currentMessage = null;
        }
      } else {
        const isMalformedHeader = trimmedLine.startsWith('[') || 
                                  /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(trimmedLine);
        
        if (isMalformedHeader) {
          if (currentMessage) {
            messages.push(currentMessage);
            currentMessage = null;
          }
        } else if (currentMessage) {
          currentMessage.message += '\n' + trimmedLine;
        }
      }
    }

    if (currentMessage) {
      messages.push(currentMessage);
    }

    // Run aggregate analysis on the messages array
    const analysis = analyzeChat(messages);

    self.postMessage({
      type: 'complete',
      data: {
        fileName,
        totalMessages: messages.length,
        participants: analysis.participants.map(name => ({ name })),
        messages: messages, // Return all messages parsed client-side
        analysis,
        sentimentAnalysis: {
          byParticipant: analysis.messagesByParticipant,
          average: analysis.averageSentiment,
          overall: analysis.averageSentiment
        },
        timeAnalysis: {
          dailyDistribution: analysis.dailyMessageCounts.reduce((acc, item) => {
            acc[item.date] = item.count;
            return acc;
          }, {}),
          hourlyDistribution: analysis.hourlyDistribution
        },
        wordFrequency: analysis.topWords.reduce((acc, item) => {
          acc[item.word] = item.count;
          return acc;
        }, {})
      }
    });

  } catch (err) {
    self.postMessage({ type: 'error', error: err.message });
  }
};

function analyzeChat(messages) {
  const participants = Array.from(new Set(messages.map(m => m.sender)));
  const messagesByParticipant = {};
  const dailyMessageCounts = {};
  const hourlyDistribution = {};
  
  let totalSentiment = 0;
  let sentimentCount = 0;
  let mediaMessages = 0;
  let textMessages = 0;
  let totalMessageLength = 0;

  const wordCounts = {};

  for (const message of messages) {
    const ts = new Date(message.timestamp);
    if (isNaN(ts.getTime())) {
      continue;
    }

    messagesByParticipant[message.sender] = (messagesByParticipant[message.sender] || 0) + 1;
    
    if (message.messageType === 'media') {
      mediaMessages++;
    } else if (message.messageType === 'text') {
      textMessages++;
      totalMessageLength += message.message.length;
      
      if (message.sentiment) {
        totalSentiment += message.sentiment.score;
        sentimentCount++;
      }

      const words = message.message.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length >= 3 && !STOPWORDS.has(word));
      
      for (const word of words) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }

    const year = ts.getFullYear();
    const month = String(ts.getMonth() + 1).padStart(2, '0');
    const day = String(ts.getDate()).padStart(2, '0');
    const dateKey = `${year}-${month}-${day}`;
    dailyMessageCounts[dateKey] = (dailyMessageCounts[dateKey] || 0) + 1;

    const hour = ts.getHours().toString();
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
  }

  const topWords = Object.entries(wordCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 200)
    .map(([word, count]) => ({ word, count }));

  const dailyMessageArray = Object.entries(dailyMessageCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const timestamps = messages.map(m => new Date(m.timestamp).getTime()).filter(t => !isNaN(t));
  
  return {
    totalMessages: messages.length,
    participants,
    dateRange: {
      start: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : new Date().toISOString(),
      end: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : new Date().toISOString()
    },
    messagesByParticipant,
    averageSentiment: sentimentCount > 0 ? totalSentiment / sentimentCount : 0,
    topWords,
    dailyMessageCounts: dailyMessageArray,
    hourlyDistribution,
    mediaMessages,
    textMessages,
    averageMessageLength: textMessages > 0 ? totalMessageLength / textMessages : 0
  };
}
