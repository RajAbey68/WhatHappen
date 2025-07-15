import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import matplotlib.pyplot as plt
from wordcloud import WordCloud
import io
import base64
from whatsapp_analyzer import WhatsAppAnalyzer
import os

# Page configuration
st.set_page_config(
    page_title="WhatsApp Chat Analyzer",
    page_icon="💬",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better styling
st.markdown("""
<style>
    .main-header {
        font-size: 3rem;
        color: #1f77b4;
        text-align: center;
        margin-bottom: 2rem;
    }
    .metric-card {
        background-color: #f0f2f6;
        padding: 1rem;
        border-radius: 0.5rem;
        border-left: 4px solid #1f77b4;
    }
    .upload-section {
        background-color: #e8f4fd;
        padding: 2rem;
        border-radius: 1rem;
        text-align: center;
        margin: 2rem 0;
    }
    .analysis-section {
        background-color: #f8f9fa;
        padding: 1.5rem;
        border-radius: 0.5rem;
        margin: 1rem 0;
    }
</style>
""", unsafe_allow_html=True)

def main():
    # Header
    st.markdown('<h1 class="main-header">💬 WhatsApp Chat Analyzer</h1>', unsafe_allow_html=True)
    
    # Sidebar
    st.sidebar.title("📊 Analysis Options")
    
    # File upload section
    st.markdown('<div class="upload-section">', unsafe_allow_html=True)
    st.markdown("### 📁 Upload Your WhatsApp Export")
    st.markdown("Export your WhatsApp chat and upload the .txt file here")
    
    uploaded_file = st.file_uploader(
        "Choose a WhatsApp export file",
        type=['txt'],
        help="Upload a WhatsApp chat export file (.txt format)"
    )
    st.markdown('</div>', unsafe_allow_html=True)
    
    if uploaded_file is not None:
        # Save uploaded file temporarily
        with open("temp_whatsapp_export.txt", "wb") as f:
            f.write(uploaded_file.getbuffer())
        
        # Initialize analyzer
        analyzer = WhatsAppAnalyzer()
        
        # Parse the file
        with st.spinner("Analyzing your WhatsApp chat..."):
            success = analyzer.parse_whatsapp_export("temp_whatsapp_export.txt")
        
        if success:
            st.success("✅ Chat analysis completed successfully!")
            
            # Get basic stats
            basic_stats = analyzer.get_basic_stats()
            
            # Display basic metrics
            col1, col2, col3, col4 = st.columns(4)
            
            with col1:
                st.markdown(f"""
                <div class="metric-card">
                    <h3>📨 Total Messages</h3>
                    <h2>{basic_stats.get('total_messages', 0):,}</h2>
                </div>
                """, unsafe_allow_html=True)
            
            with col2:
                st.markdown(f"""
                <div class="metric-card">
                    <h3>👥 Participants</h3>
                    <h2>{basic_stats.get('total_participants', 0)}</h2>
                </div>
                """, unsafe_allow_html=True)
            
            with col3:
                st.markdown(f"""
                <div class="metric-card">
                    <h3>📅 Date Range</h3>
                    <h2>{basic_stats.get('total_days', 0)} days</h2>
                </div>
                """, unsafe_allow_html=True)
            
            with col4:
                st.markdown(f"""
                <div class="metric-card">
                    <h3>📊 Avg/Day</h3>
                    <h2>{basic_stats.get('messages_per_day', 0):.1f}</h2>
                </div>
                """, unsafe_allow_html=True)
            
            # Analysis tabs
            tab1, tab2, tab3, tab4, tab5, tab6 = st.tabs([
                "📈 Activity Analysis", 
                "👥 Participant Analysis", 
                "😊 Emoji Analysis",
                "📝 Word Analysis",
                "💭 Sentiment Analysis",
                "📊 Full Report"
            ])
            
            with tab1:
                st.markdown('<div class="analysis-section">', unsafe_allow_html=True)
                st.subheader("📈 Message Activity Analysis")
                
                # Activity heatmap
                heatmap_fig = analyzer.create_activity_heatmap()
                if heatmap_fig:
                    st.plotly_chart(heatmap_fig, use_container_width=True)
                
                # Timeline
                timeline_fig = analyzer.create_message_timeline()
                if timeline_fig:
                    st.plotly_chart(timeline_fig, use_container_width=True)
                
                # Hourly and daily activity
                col1, col2 = st.columns(2)
                
                with col1:
                    hourly_activity = analyzer.get_message_activity_by_hour()
                    if hourly_activity:
                        hourly_df = pd.DataFrame(list(hourly_activity.items()), columns=['Hour', 'Messages'])
                        fig = px.bar(hourly_df, x='Hour', y='Messages', title='Messages by Hour of Day')
                        st.plotly_chart(fig, use_container_width=True)
                
                with col2:
                    daily_activity = analyzer.get_message_activity_by_day()
                    if daily_activity:
                        daily_df = pd.DataFrame(list(daily_activity.items()), columns=['Day', 'Messages'])
                        fig = px.bar(daily_df, x='Day', y='Messages', title='Messages by Day of Week')
                        st.plotly_chart(fig, use_container_width=True)
                
                st.markdown('</div>', unsafe_allow_html=True)
            
            with tab2:
                st.markdown('<div class="analysis-section">', unsafe_allow_html=True)
                st.subheader("👥 Participant Analysis")
                
                # Participant comparison
                participant_fig = analyzer.create_participant_comparison()
                if participant_fig:
                    st.plotly_chart(participant_fig, use_container_width=True)
                
                # Participant details
                participant_stats = basic_stats.get('messages_per_participant', {})
                if participant_stats:
                    st.subheader("📊 Participant Statistics")
                    participant_df = pd.DataFrame(list(participant_stats.items()), columns=['Participant', 'Messages'])
                    participant_df['Percentage'] = (participant_df['Messages'] / participant_df['Messages'].sum() * 100).round(1)
                    
                    st.dataframe(participant_df, use_container_width=True)
                
                st.markdown('</div>', unsafe_allow_html=True)
            
            with tab3:
                st.markdown('<div class="analysis-section">', unsafe_allow_html=True)
                st.subheader("😊 Emoji Analysis")
                
                emoji_analysis = analyzer.get_emoji_analysis()
                
                if emoji_analysis:
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        st.metric("Total Emojis", emoji_analysis.get('total_emojis', 0))
                        st.metric("Messages with Emojis", emoji_analysis.get('messages_with_emojis', 0))
                    
                    with col2:
                        if emoji_analysis.get('total_emojis', 0) > 0:
                            emoji_percentage = (emoji_analysis.get('messages_with_emojis', 0) / basic_stats.get('total_messages', 1)) * 100
                            st.metric("Emoji Usage %", f"{emoji_percentage:.1f}%")
                    
                    # Top emojis
                    top_emojis = emoji_analysis.get('top_emojis', {})
                    if top_emojis:
                        st.subheader("🔥 Most Used Emojis")
                        emoji_df = pd.DataFrame(list(top_emojis.items()), columns=['Emoji', 'Count'])
                        
                        # Create emoji bar chart
                        fig = px.bar(emoji_df, x='Emoji', y='Count', title='Top Emojis Used')
                        st.plotly_chart(fig, use_container_width=True)
                        
                        # Display emojis with counts
                        st.markdown("**Top 10 Emojis:**")
                        for emoji_char, count in list(top_emojis.items())[:10]:
                            st.markdown(f"{emoji_char} ({count} times)")
                
                st.markdown('</div>', unsafe_allow_html=True)
            
            with tab4:
                st.markdown('<div class="analysis-section">', unsafe_allow_html=True)
                st.subheader("📝 Word Analysis")
                
                word_analysis = analyzer.get_word_analysis()
                
                if word_analysis:
                    col1, col2, col3 = st.columns(3)
                    
                    with col1:
                        st.metric("Total Words", word_analysis.get('total_words', 0))
                    
                    with col2:
                        st.metric("Unique Words", word_analysis.get('unique_words', 0))
                    
                    with col3:
                        st.metric("Avg Words/Message", f"{word_analysis.get('avg_words_per_message', 0):.1f}")
                    
                    # Word cloud
                    st.subheader("☁️ Word Cloud")
                    wordcloud = analyzer.generate_wordcloud()
                    if wordcloud:
                        fig, ax = plt.subplots(figsize=(10, 6))
                        ax.imshow(wordcloud, interpolation='bilinear')
                        ax.axis('off')
                        st.pyplot(fig)
                    
                    # Top words
                    top_words = word_analysis.get('top_words', {})
                    if top_words:
                        st.subheader("📊 Most Used Words")
                        word_df = pd.DataFrame(list(top_words.items()), columns=['Word', 'Count'])
                        
                        fig = px.bar(word_df.head(15), x='Word', y='Count', title='Top 15 Words Used')
                        st.plotly_chart(fig, use_container_width=True)
                
                st.markdown('</div>', unsafe_allow_html=True)
            
            with tab5:
                st.markdown('<div class="analysis-section">', unsafe_allow_html=True)
                st.subheader("💭 Sentiment Analysis")
                
                sentiment_analysis = analyzer.get_sentiment_analysis()
                
                if sentiment_analysis:
                    col1, col2, col3, col4 = st.columns(4)
                    
                    with col1:
                        avg_sentiment = sentiment_analysis.get('avg_sentiment', 0)
                        sentiment_color = "green" if avg_sentiment > 0 else "red" if avg_sentiment < 0 else "gray"
                        st.markdown(f"""
                        <div style="text-align: center; padding: 1rem; background-color: {sentiment_color}20; border-radius: 0.5rem;">
                            <h3>Average Sentiment</h3>
                            <h2 style="color: {sentiment_color};">{avg_sentiment:.3f}</h2>
                        </div>
                        """, unsafe_allow_html=True)
                    
                    with col2:
                        st.metric("Positive Messages", sentiment_analysis.get('positive_messages', 0))
                    
                    with col3:
                        st.metric("Negative Messages", sentiment_analysis.get('negative_messages', 0))
                    
                    with col4:
                        st.metric("Neutral Messages", sentiment_analysis.get('neutral_messages', 0))
                    
                    # Sentiment distribution
                    if analyzer.df is not None and 'sentiment' in analyzer.df.columns:
                        st.subheader("📊 Sentiment Distribution")
                        fig = px.histogram(analyzer.df, x='sentiment', nbins=30, title='Distribution of Message Sentiments')
                        fig.add_vline(x=0, line_dash="dash", line_color="red", annotation_text="Neutral")
                        st.plotly_chart(fig, use_container_width=True)
                
                st.markdown('</div>', unsafe_allow_html=True)
            
            with tab6:
                st.markdown('<div class="analysis-section">', unsafe_allow_html=True)
                st.subheader("📊 Full Analysis Report")
                
                # Generate and display full report
                if st.button("Generate Full Report"):
                    with st.spinner("Generating comprehensive report..."):
                        analyzer.export_analysis_report("whatsapp_analysis_report.html")
                    
                    # Read and display the report
                    with open("whatsapp_analysis_report.html", "r", encoding="utf-8") as f:
                        html_content = f.read()
                    
                    st.components.v1.html(html_content, height=800, scrolling=True)
                    
                    # Download button
                    with open("whatsapp_analysis_report.html", "r", encoding="utf-8") as f:
                        report_data = f.read()
                    
                    st.download_button(
                        label="📥 Download Report",
                        data=report_data,
                        file_name="whatsapp_analysis_report.html",
                        mime="text/html"
                    )
                
                st.markdown('</div>', unsafe_allow_html=True)
            
            # Clean up temporary file
            if os.path.exists("temp_whatsapp_export.txt"):
                os.remove("temp_whatsapp_export.txt")
        
        else:
            st.error("❌ Failed to parse the WhatsApp export file. Please check the file format.")
    
    else:
        # Instructions when no file is uploaded
        st.markdown("""
        ## 📋 How to Use This Analyzer
        
        ### Step 1: Export Your WhatsApp Chat
        1. Open WhatsApp on your phone
        2. Go to the chat you want to analyze
        3. Tap the three dots menu (⋮)
        4. Select "More" → "Export chat"
        5. Choose "Without media" to get a smaller file
        6. Send the file to yourself via email or save it
        
        ### Step 2: Upload and Analyze
        1. Upload the exported .txt file using the uploader above
        2. Wait for the analysis to complete
        3. Explore the different analysis tabs
        
        ### Features Available:
        - 📈 **Activity Analysis**: Message patterns by time and day
        - 👥 **Participant Analysis**: Who talks the most
        - 😊 **Emoji Analysis**: Most used emojis and emoji patterns
        - 📝 **Word Analysis**: Word frequency and word clouds
        - 💭 **Sentiment Analysis**: Overall mood of conversations
        - 📊 **Full Report**: Comprehensive HTML report
        
        ### Privacy Note:
        - Your chat data is processed locally and not stored
        - Files are automatically deleted after analysis
        - No data is sent to external servers
        """)

if __name__ == "__main__":
    main()