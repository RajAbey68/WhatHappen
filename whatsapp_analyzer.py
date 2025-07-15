import pandas as pd
import re
import emoji
from datetime import datetime, timedelta
from collections import Counter, defaultdict
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from wordcloud import WordCloud
import nltk
from textblob import TextBlob
import warnings
warnings.filterwarnings('ignore')

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

class WhatsAppAnalyzer:
    def __init__(self, file_path=None):
        """
        Initialize WhatsApp Analyzer
        
        Args:
            file_path (str): Path to WhatsApp export file
        """
        self.file_path = file_path
        self.messages = []
        self.df = None
        self.participants = set()
        
    def parse_whatsapp_export(self, file_path=None):
        """
        Parse WhatsApp export file
        
        Args:
            file_path (str): Path to WhatsApp export file
            
        Returns:
            bool: True if successful, False otherwise
        """
        if file_path:
            self.file_path = file_path
            
        if not self.file_path:
            raise ValueError("No file path provided")
            
        try:
            with open(self.file_path, 'r', encoding='utf-8') as file:
                lines = file.readlines()
                
            # WhatsApp export format: [date, time] sender: message
            pattern = r'\[(\d{1,2}/\d{1,2}/\d{2,4}),\s*(\d{1,2}:\d{2}:\d{2})\]\s*(.*?):\s*(.*)'
            
            for line in lines:
                match = re.match(pattern, line.strip())
                if match:
                    date_str, time_str, sender, message = match.groups()
                    
                    # Parse date and time
                    try:
                        if len(date_str.split('/')[2]) == 2:
                            date_str = date_str.replace('/', '/20', 1)
                        datetime_obj = datetime.strptime(f"{date_str} {time_str}", "%d/%m/%Y %H:%M:%S")
                    except ValueError:
                        continue
                    
                    self.messages.append({
                        'datetime': datetime_obj,
                        'date': datetime_obj.date(),
                        'time': datetime_obj.time(),
                        'sender': sender.strip(),
                        'message': message.strip(),
                        'hour': datetime_obj.hour,
                        'day_of_week': datetime_obj.strftime('%A'),
                        'month': datetime_obj.strftime('%B'),
                        'year': datetime_obj.year
                    })
                    
                    self.participants.add(sender.strip())
            
            if self.messages:
                self.df = pd.DataFrame(self.messages)
                return True
            else:
                return False
                
        except FileNotFoundError:
            print(f"Error: File '{self.file_path}' not found")
            return False
        except Exception as e:
            print(f"Error parsing file: {str(e)}")
            return False
    
    def get_basic_stats(self):
        """
        Get basic statistics about the chat
        
        Returns:
            dict: Basic statistics
        """
        if self.df is None:
            return {}
            
        stats = {
            'total_messages': len(self.df),
            'total_participants': len(self.participants),
            'date_range': {
                'start': self.df['date'].min(),
                'end': self.df['date'].max()
            },
            'total_days': (self.df['date'].max() - self.df['date'].min()).days + 1,
            'messages_per_day': len(self.df) / ((self.df['date'].max() - self.df['date'].min()).days + 1)
        }
        
        # Messages per participant
        participant_stats = self.df['sender'].value_counts().to_dict()
        stats['messages_per_participant'] = participant_stats
        
        return stats
    
    def get_message_activity_by_hour(self):
        """
        Get message activity by hour of day
        
        Returns:
            dict: Activity by hour
        """
        if self.df is None:
            return {}
            
        hourly_activity = self.df['hour'].value_counts().sort_index().to_dict()
        return hourly_activity
    
    def get_message_activity_by_day(self):
        """
        Get message activity by day of week
        
        Returns:
            dict: Activity by day
        """
        if self.df is None:
            return {}
            
        daily_activity = self.df['day_of_week'].value_counts().to_dict()
        return daily_activity
    
    def get_emoji_analysis(self):
        """
        Analyze emoji usage
        
        Returns:
            dict: Emoji statistics
        """
        if self.df is None:
            return {}
            
        emoji_counts = Counter()
        emoji_per_message = []
        
        for message in self.df['message']:
            emojis = emoji.emoji_list(message)
            emoji_count = len(emojis)
            emoji_per_message.append(emoji_count)
            
            for e in emojis:
                emoji_counts[e['emoji']] += 1
        
        self.df['emoji_count'] = emoji_per_message
        
        return {
            'total_emojis': sum(emoji_per_message),
            'emoji_per_message': emoji_per_message,
            'top_emojis': dict(emoji_counts.most_common(10)),
            'messages_with_emojis': sum(1 for count in emoji_per_message if count > 0)
        }
    
    def get_word_analysis(self):
        """
        Analyze word usage
        
        Returns:
            dict: Word statistics
        """
        if self.df is None:
            return {}
            
        all_words = []
        word_counts = Counter()
        
        for message in self.df['message']:
            # Remove emojis and special characters
            clean_message = emoji.replace_emojis(message, '')
            words = re.findall(r'\b\w+\b', clean_message.lower())
            all_words.extend(words)
            word_counts.update(words)
        
        return {
            'total_words': len(all_words),
            'unique_words': len(set(all_words)),
            'avg_words_per_message': len(all_words) / len(self.df),
            'top_words': dict(word_counts.most_common(20))
        }
    
    def get_sentiment_analysis(self):
        """
        Perform sentiment analysis on messages
        
        Returns:
            dict: Sentiment statistics
        """
        if self.df is None:
            return {}
            
        sentiments = []
        for message in self.df['message']:
            blob = TextBlob(message)
            sentiments.append(blob.sentiment.polarity)
        
        self.df['sentiment'] = sentiments
        
        return {
            'avg_sentiment': sum(sentiments) / len(sentiments),
            'positive_messages': sum(1 for s in sentiments if s > 0.1),
            'negative_messages': sum(1 for s in sentiments if s < -0.1),
            'neutral_messages': sum(1 for s in sentiments if -0.1 <= s <= 0.1)
        }
    
    def create_activity_heatmap(self):
        """
        Create activity heatmap
        
        Returns:
            plotly.graph_objects.Figure: Heatmap figure
        """
        if self.df is None:
            return None
            
        # Create pivot table for heatmap
        activity_data = self.df.groupby(['day_of_week', 'hour']).size().reset_index(name='count')
        
        # Reorder days
        day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        activity_data['day_of_week'] = pd.Categorical(activity_data['day_of_week'], categories=day_order, ordered=True)
        activity_data = activity_data.sort_values('day_of_week')
        
        # Create heatmap
        fig = px.imshow(
            activity_data.pivot(index='day_of_week', columns='hour', values='count'),
            title='Message Activity Heatmap',
            labels={'x': 'Hour of Day', 'y': 'Day of Week', 'color': 'Message Count'},
            color_continuous_scale='Blues'
        )
        
        return fig
    
    def create_message_timeline(self):
        """
        Create message timeline
        
        Returns:
            plotly.graph_objects.Figure: Timeline figure
        """
        if self.df is None:
            return None
            
        daily_messages = self.df.groupby('date').size().reset_index(name='count')
        
        fig = px.line(
            daily_messages,
            x='date',
            y='count',
            title='Daily Message Activity',
            labels={'date': 'Date', 'count': 'Message Count'}
        )
        
        return fig
    
    def create_participant_comparison(self):
        """
        Create participant comparison chart
        
        Returns:
            plotly.graph_objects.Figure: Comparison figure
        """
        if self.df is None:
            return None
            
        participant_stats = self.df['sender'].value_counts()
        
        fig = px.bar(
            x=participant_stats.index,
            y=participant_stats.values,
            title='Messages by Participant',
            labels={'x': 'Participant', 'y': 'Message Count'}
        )
        
        return fig
    
    def generate_wordcloud(self, max_words=100):
        """
        Generate word cloud
        
        Args:
            max_words (int): Maximum number of words to include
            
        Returns:
            WordCloud: Word cloud object
        """
        if self.df is None:
            return None
            
        # Combine all messages
        all_text = ' '.join(self.df['message'].astype(str))
        
        # Remove emojis
        clean_text = emoji.replace_emojis(all_text, '')
        
        # Create word cloud
        wordcloud = WordCloud(
            width=800,
            height=400,
            background_color='white',
            max_words=max_words,
            colormap='viridis'
        ).generate(clean_text)
        
        return wordcloud
    
    def export_analysis_report(self, output_path='whatsapp_analysis_report.html'):
        """
        Export comprehensive analysis report
        
        Args:
            output_path (str): Path to save the report
        """
        if self.df is None:
            print("No data to analyze. Please parse a WhatsApp export file first.")
            return
        
        # Generate all analyses
        basic_stats = self.get_basic_stats()
        hourly_activity = self.get_message_activity_by_hour()
        daily_activity = self.get_message_activity_by_day()
        emoji_analysis = self.get_emoji_analysis()
        word_analysis = self.get_word_analysis()
        sentiment_analysis = self.get_sentiment_analysis()
        
        # Create HTML report
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>WhatsApp Chat Analysis Report</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 20px; }}
                .section {{ margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }}
                .stat {{ margin: 10px 0; }}
                .highlight {{ background-color: #f0f8ff; padding: 10px; border-radius: 5px; }}
            </style>
        </head>
        <body>
            <h1>WhatsApp Chat Analysis Report</h1>
            
            <div class="section">
                <h2>Basic Statistics</h2>
                <div class="stat">Total Messages: {basic_stats.get('total_messages', 0)}</div>
                <div class="stat">Total Participants: {basic_stats.get('total_participants', 0)}</div>
                <div class="stat">Date Range: {basic_stats.get('date_range', {}).get('start', 'N/A')} to {basic_stats.get('date_range', {}).get('end', 'N/A')}</div>
                <div class="stat">Total Days: {basic_stats.get('total_days', 0)}</div>
                <div class="stat">Average Messages per Day: {basic_stats.get('messages_per_day', 0):.2f}</div>
            </div>
            
            <div class="section">
                <h2>Participant Activity</h2>
                {''.join([f'<div class="stat">{participant}: {count} messages</div>' for participant, count in basic_stats.get('messages_per_participant', {}).items()])}
            </div>
            
            <div class="section">
                <h2>Emoji Analysis</h2>
                <div class="stat">Total Emojis Used: {emoji_analysis.get('total_emojis', 0)}</div>
                <div class="stat">Messages with Emojis: {emoji_analysis.get('messages_with_emojis', 0)}</div>
                <div class="highlight">
                    <h3>Top Emojis:</h3>
                    {''.join([f'<span style="font-size: 20px;">{emoji}</span> ({count}) ' for emoji, count in emoji_analysis.get('top_emojis', {}).items()])}
                </div>
            </div>
            
            <div class="section">
                <h2>Word Analysis</h2>
                <div class="stat">Total Words: {word_analysis.get('total_words', 0)}</div>
                <div class="stat">Unique Words: {word_analysis.get('unique_words', 0)}</div>
                <div class="stat">Average Words per Message: {word_analysis.get('avg_words_per_message', 0):.2f}</div>
            </div>
            
            <div class="section">
                <h2>Sentiment Analysis</h2>
                <div class="stat">Average Sentiment: {sentiment_analysis.get('avg_sentiment', 0):.3f}</div>
                <div class="stat">Positive Messages: {sentiment_analysis.get('positive_messages', 0)}</div>
                <div class="stat">Negative Messages: {sentiment_analysis.get('negative_messages', 0)}</div>
                <div class="stat">Neutral Messages: {sentiment_analysis.get('neutral_messages', 0)}</div>
            </div>
        </body>
        </html>
        """
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(html_content)
        
        print(f"Analysis report saved to: {output_path}")

def main():
    """
    Main function for testing the analyzer
    """
    analyzer = WhatsAppAnalyzer()
    
    # Example usage
    print("WhatsApp Export Analyzer")
    print("=" * 30)
    
    # You would typically load a file here
    # success = analyzer.parse_whatsapp_export('path_to_your_export.txt')
    
    print("To use this analyzer:")
    print("1. Export your WhatsApp chat")
    print("2. Use: analyzer.parse_whatsapp_export('your_file.txt')")
    print("3. Call analysis methods on the analyzer object")

if __name__ == "__main__":
    main()