# WhatHappen - WhatsApp Export Analysis

A comprehensive WhatsApp chat analysis tool that provides deep insights into your conversations through data visualization, sentiment analysis, and statistical reporting.

## 🚀 Features

### 📊 Analytics
- **Message Activity Analysis**: Visualize when messages are sent (hourly, daily, weekly patterns)
- **Participant Analysis**: See who talks the most and participation statistics
- **Emoji Analysis**: Discover most used emojis and emoji patterns
- **Word Analysis**: Word frequency analysis with interactive word clouds
- **Sentiment Analysis**: Understand the overall mood of conversations
- **Comprehensive Reports**: Generate detailed HTML reports

### 🎨 Visualizations
- Interactive heatmaps showing activity patterns
- Timeline charts for message trends
- Bar charts for participant comparisons
- Word clouds for text analysis
- Sentiment distribution histograms

### 🔒 Privacy & Security
- **Local Processing**: All analysis happens on your device
- **No Data Storage**: Files are automatically deleted after analysis
- **No External Servers**: Your data never leaves your computer

## 📋 Requirements

- Python 3.8 or higher
- pip (Python package installer)

## 🛠️ Installation

1. **Clone or download this repository**
   ```bash
   git clone <repository-url>
   cd WhatHappen
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**
   ```bash
   streamlit run app.py
   ```

4. **Open your browser**
   - The app will automatically open at `http://localhost:8501`
   - If it doesn't open automatically, manually navigate to the URL

## 📱 How to Export WhatsApp Chats

### Step 1: Export from WhatsApp
1. Open WhatsApp on your phone
2. Navigate to the chat you want to analyze
3. Tap the three dots menu (⋮) in the top right
4. Select "More" → "Export chat"
5. Choose "Without media" for smaller file size
6. Send the file to yourself via email or save it to your device

### Step 2: Upload and Analyze
1. Open the WhatHappen web application
2. Click "Browse files" and select your exported .txt file
3. Wait for the analysis to complete
4. Explore the different analysis tabs

## 📊 Understanding the Analysis

### Activity Analysis Tab
- **Heatmap**: Shows message activity by day of week and hour
- **Timeline**: Displays daily message counts over time
- **Hourly/Daily Charts**: Bar charts showing activity patterns

### Participant Analysis Tab
- **Comparison Chart**: Visual comparison of message counts by participant
- **Statistics Table**: Detailed breakdown with percentages

### Emoji Analysis Tab
- **Emoji Metrics**: Total emojis used and usage percentage
- **Top Emojis**: Most frequently used emojis with counts
- **Visual Charts**: Bar charts showing emoji popularity

### Word Analysis Tab
- **Word Statistics**: Total words, unique words, average per message
- **Word Cloud**: Visual representation of most common words
- **Word Frequency**: Bar chart of top 15 most used words

### Sentiment Analysis Tab
- **Sentiment Metrics**: Average sentiment score and message breakdown
- **Distribution Chart**: Histogram showing sentiment distribution
- **Color Coding**: Green for positive, red for negative, gray for neutral

### Full Report Tab
- **Comprehensive HTML Report**: Complete analysis in downloadable format
- **Download Option**: Save the report for offline viewing

## 🔧 Technical Details

### File Format Support
The analyzer supports standard WhatsApp export format:
```
[date, time] sender: message
```

Example:
```
[15/12/2023, 14:30:25] John Doe: Hello! How are you?
[15/12/2023, 14:31:10] Jane Smith: I'm good, thanks! 😊
```

### Dependencies
- **pandas**: Data manipulation and analysis
- **matplotlib**: Basic plotting
- **seaborn**: Statistical data visualization
- **plotly**: Interactive visualizations
- **streamlit**: Web application framework
- **emoji**: Emoji detection and processing
- **wordcloud**: Word cloud generation
- **nltk**: Natural language processing
- **textblob**: Sentiment analysis

## 🐛 Troubleshooting

### Common Issues

**1. File Upload Fails**
- Ensure the file is in .txt format
- Check that the file follows WhatsApp export format
- Verify the file isn't corrupted

**2. Analysis Shows No Data**
- Confirm the file contains valid WhatsApp export data
- Check the date format in your export
- Ensure messages follow the expected pattern

**3. Dependencies Installation Issues**
- Update pip: `pip install --upgrade pip`
- Install dependencies individually if needed
- Check Python version compatibility

**4. Streamlit App Won't Start**
- Verify all dependencies are installed
- Check if port 8501 is available
- Try running with: `streamlit run app.py --server.port 8502`

### Error Messages

**"File not found"**
- Check the file path is correct
- Ensure the file exists in the specified location

**"Failed to parse WhatsApp export"**
- Verify the file format matches WhatsApp export structure
- Check for encoding issues (try UTF-8)

**"No data to analyze"**
- Confirm the file contains valid message data
- Check the regex pattern matches your export format

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Built with [Streamlit](https://streamlit.io/) for the web interface
- Uses [Plotly](https://plotly.com/) for interactive visualizations
- Emoji analysis powered by the [emoji](https://github.com/carpedm20/emoji) library
- Sentiment analysis using [TextBlob](https://textblob.readthedocs.io/)

## 📞 Support

If you encounter any issues or have questions:
1. Check the troubleshooting section above
2. Review the error messages for specific guidance
3. Ensure your WhatsApp export follows the expected format

---

**Note**: This tool is designed for personal use and educational purposes. Always respect privacy and ensure you have permission to analyze chat data.
