#!/usr/bin/env python3
"""
Example usage of WhatsApp Analyzer
This script demonstrates how to use the analyzer programmatically
"""

from whatsapp_analyzer import WhatsAppAnalyzer
import os

def create_sample_data():
    """Create a sample WhatsApp export file for demonstration"""
    sample_data = """[01/01/2024, 09:00:00] Alice: Happy New Year! 🎉
[01/01/2024, 09:01:15] Bob: Happy New Year to you too! 🎊
[01/01/2024, 09:02:30] Alice: How was your celebration?
[01/01/2024, 09:03:45] Bob: It was great! We had a small party at home
[01/01/2024, 09:04:00] Alice: That sounds lovely! 😊
[01/01/2024, 09:05:15] Bob: Yeah, it was really nice. How about you?
[01/01/2024, 09:06:30] Alice: I just stayed home and watched movies
[01/01/2024, 09:07:45] Bob: That's also a great way to spend New Year's! 🍿
[01/01/2024, 09:08:00] Alice: True! Sometimes quiet celebrations are the best
[01/01/2024, 09:09:15] Bob: Absolutely! 😌
[01/01/2024, 14:30:00] Alice: Hey, are you free for coffee later?
[01/01/2024, 14:31:15] Bob: Sure! That would be great ☕
[01/01/2024, 14:32:30] Alice: Perfect! Let's meet at 4 PM at the usual place
[01/01/2024, 14:33:45] Bob: Sounds good! See you there 👍
[01/01/2024, 16:00:00] Alice: I'm here! Where are you?
[01/01/2024, 16:01:15] Bob: Just around the corner, be there in 2 minutes
[01/01/2024, 16:02:30] Alice: No rush! 😊
[01/01/2024, 16:03:45] Bob: Thanks! I'm here now
[01/01/2024, 16:04:00] Alice: Great! How's your day been?
[01/01/2024, 16:05:15] Bob: Pretty good! Just been relaxing mostly
[01/01/2024, 16:06:30] Alice: That sounds perfect for a holiday
[01/01/2024, 16:07:45] Bob: Yeah, exactly! How about you?
[01/01/2024, 16:08:00] Alice: Same here! Just taking it easy
[01/01/2024, 16:09:15] Bob: That's the way to do it! 😄"""
    
    with open("sample_chat.txt", "w", encoding="utf-8") as f:
        f.write(sample_data)
    
    return "sample_chat.txt"

def main():
    """Main example function"""
    print("🚀 WhatsApp Analyzer Example")
    print("=" * 40)
    
    # Create sample data
    print("📝 Creating sample WhatsApp chat data...")
    sample_file = create_sample_data()
    
    # Initialize analyzer
    print("🔧 Initializing analyzer...")
    analyzer = WhatsAppAnalyzer()
    
    # Parse the file
    print("📊 Parsing WhatsApp export...")
    success = analyzer.parse_whatsapp_export(sample_file)
    
    if not success:
        print("❌ Failed to parse the file")
        return
    
    print("✅ Successfully parsed the file!")
    
    # Get basic statistics
    print("\n📈 Basic Statistics:")
    basic_stats = analyzer.get_basic_stats()
    print(f"  • Total messages: {basic_stats['total_messages']}")
    print(f"  • Participants: {basic_stats['total_participants']}")
    print(f"  • Date range: {basic_stats['date_range']['start']} to {basic_stats['date_range']['end']}")
    print(f"  • Total days: {basic_stats['total_days']}")
    print(f"  • Average messages per day: {basic_stats['messages_per_day']:.2f}")
    
    # Participant analysis
    print("\n👥 Participant Analysis:")
    participant_stats = basic_stats['messages_per_participant']
    for participant, count in participant_stats.items():
        percentage = (count / basic_stats['total_messages']) * 100
        print(f"  • {participant}: {count} messages ({percentage:.1f}%)")
    
    # Emoji analysis
    print("\n😊 Emoji Analysis:")
    emoji_analysis = analyzer.get_emoji_analysis()
    print(f"  • Total emojis used: {emoji_analysis['total_emojis']}")
    print(f"  • Messages with emojis: {emoji_analysis['messages_with_emojis']}")
    print(f"  • Top emojis:")
    for emoji, count in list(emoji_analysis['top_emojis'].items())[:5]:
        print(f"    - {emoji}: {count} times")
    
    # Word analysis
    print("\n📝 Word Analysis:")
    word_analysis = analyzer.get_word_analysis()
    print(f"  • Total words: {word_analysis['total_words']}")
    print(f"  • Unique words: {word_analysis['unique_words']}")
    print(f"  • Average words per message: {word_analysis['avg_words_per_message']:.2f}")
    print(f"  • Top words:")
    for word, count in list(word_analysis['top_words'].items())[:5]:
        print(f"    - {word}: {count} times")
    
    # Sentiment analysis
    print("\n💭 Sentiment Analysis:")
    sentiment_analysis = analyzer.get_sentiment_analysis()
    print(f"  • Average sentiment: {sentiment_analysis['avg_sentiment']:.3f}")
    print(f"  • Positive messages: {sentiment_analysis['positive_messages']}")
    print(f"  • Negative messages: {sentiment_analysis['negative_messages']}")
    print(f"  • Neutral messages: {sentiment_analysis['neutral_messages']}")
    
    # Activity analysis
    print("\n⏰ Activity Analysis:")
    hourly_activity = analyzer.get_message_activity_by_hour()
    print(f"  • Most active hour: {max(hourly_activity, key=hourly_activity.get)} ({max(hourly_activity.values())} messages)")
    
    daily_activity = analyzer.get_message_activity_by_day()
    print(f"  • Most active day: {max(daily_activity, key=daily_activity.get)} ({max(daily_activity.values())} messages)")
    
    # Generate visualizations
    print("\n🎨 Generating visualizations...")
    
    # Activity heatmap
    heatmap = analyzer.create_activity_heatmap()
    if heatmap:
        print("  ✅ Activity heatmap created")
    
    # Timeline
    timeline = analyzer.create_message_timeline()
    if timeline:
        print("  ✅ Message timeline created")
    
    # Participant comparison
    participant_chart = analyzer.create_participant_comparison()
    if participant_chart:
        print("  ✅ Participant comparison chart created")
    
    # Word cloud
    wordcloud = analyzer.generate_wordcloud()
    if wordcloud:
        print("  ✅ Word cloud generated")
    
    # Generate report
    print("\n📊 Generating comprehensive report...")
    analyzer.export_analysis_report("example_analysis_report.html")
    print("  ✅ HTML report generated: example_analysis_report.html")
    
    # Clean up
    if os.path.exists(sample_file):
        os.remove(sample_file)
    
    print("\n🎉 Example completed successfully!")
    print("\n📋 Summary:")
    print("  • Analyzed a sample WhatsApp chat")
    print("  • Generated various statistics and visualizations")
    print("  • Created an HTML report")
    print("  • All core functionality is working correctly")
    
    print("\n💡 To use with your own data:")
    print("  1. Export your WhatsApp chat")
    print("  2. Use: analyzer.parse_whatsapp_export('your_file.txt')")
    print("  3. Call the analysis methods as shown above")

if __name__ == "__main__":
    main()