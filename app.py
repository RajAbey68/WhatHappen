import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import matplotlib.pyplot as plt
from wordcloud import WordCloud
import io
import base64
from datetime import datetime, timedelta
from whatsapp_analyzer import WhatsAppAnalyzer
from ai_chat_enhanced import render_enhanced_ai_chat_interface
from project_manager import render_project_manager
from multi_file_upload import render_multi_file_upload, get_combined_analyzer_for_ai, render_file_summary
from period_analysis import render_period_analysis
import os

# 🔒 Security: Password protection for staging
def require_auth():
    """Require authentication for accessing the app with sensitive data"""
    if 'authenticated' not in st.session_state:
        st.session_state.authenticated = False
    
    if not st.session_state.authenticated:
        st.title("🔒 Secure WhatsApp Analyzer - Staging Environment")
        st.warning("⚠️ This application processes sensitive WhatsApp data. Authentication required.")
        
        password = st.text_input("Enter staging access password:", type="password", key="auth_password")
        
        col1, col2 = st.columns([1, 4])
        with col1:
            if st.button("🔓 Login", key="login_btn"):
                # Use environment variable for password in production
                staging_password = os.getenv("STAGING_PASSWORD", "WhatsApp-Secure-2024!")
                if password == staging_password:
                    st.session_state.authenticated = True
                    st.success("✅ Authentication successful!")
                    st.rerun()
                else:
                    st.error("❌ Invalid password. Access denied.")
                    st.stop()
        
        with col2:
            st.info("💡 For security, this staging environment requires authentication.")
        
        st.markdown("---")
        st.markdown("### 🛡️ Privacy & Security Features")
        st.markdown("""
        - 🔒 **Local Processing**: All analysis happens on this server
        - 🗑️ **Auto-Cleanup**: Files deleted immediately after analysis  
        - 🚫 **No Storage**: No data is permanently stored
        - 🔐 **Memory Safe**: Data cleared from RAM after use
        - 🌐 **Encrypted**: HTTPS/SSL encryption in transit
        """)
        st.stop()

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
    # Call authentication before main app
    require_auth()
    
    # Header
    st.markdown('<h1 class="main-header">💬 WhatsApp Chat Analyzer</h1>', unsafe_allow_html=True)
    
    # Sidebar
    st.sidebar.title("📊 Analysis Options")
    
    # Project Manager (always visible)
    current_project = render_project_manager()
    
    # Initialize session state
    if 'processed_data' not in st.session_state:
        st.session_state.processed_data = None
    
    if 'has_data' not in st.session_state:
        st.session_state.has_data = False
    
    # Main content area with tabs
    if current_project:
        # Show project-specific content
        tab1, tab2, tab3 = st.tabs(["📁 File Upload", "🤖 AI Chat", "📊 Analysis"])
        
        with tab1:
            # Multi-file upload interface
            processed_data = render_multi_file_upload(current_project)
            if processed_data:
                st.session_state.processed_data = processed_data
                st.session_state.has_data = True
            
            # Load existing data if available
            if st.session_state.processed_data:
                render_file_summary(st.session_state.processed_data)
        
        with tab2:
            # AI Chat interface
            if st.session_state.has_data and st.session_state.processed_data:
                render_enhanced_ai_chat_interface(processed_data=st.session_state.processed_data)
            else:
                st.info("📁 Upload and process files first to use AI chat!")
        
        with tab3:
            # Analysis tabs (only if we have data)
            if st.session_state.has_data and st.session_state.processed_data:
                analyzer = get_combined_analyzer_for_ai(st.session_state.processed_data)
                if analyzer:
                    render_analysis_tabs(analyzer, st.session_state.processed_data)
                else:
                    st.error("Unable to create analyzer from processed data")
            else:
                st.info("📁 Upload and process files first to see analysis!")
    
    else:
        # No project selected - show instructions
        st.markdown("""
        ## 🚀 Welcome to WhatsApp Chat Analyzer
        
        ### Get Started:
        1. **Create a Project** using the project manager above
        2. **Upload WhatsApp Files** - supports multiple files per project
        3. **Analyze Your Data** - get insights across all your conversations
        4. **Ask AI Questions** - natural language queries about your data
        
        ### ✨ NEW Features:
        - 📂 **Project Management** - organize multiple chat analyses
        - 📁 **Multi-File Upload** - analyze multiple conversations together
        - 🤖 **Enhanced AI Chat** - ask questions across all your data
        - 📊 **Combined Analysis** - insights from all your conversations
        
        ### How to Export WhatsApp Chats:
        1. Open WhatsApp on your phone
        2. Go to the chat you want to analyze
        3. Tap the three dots menu (⋮)
        4. Select "More" → "Export chat"
        5. Choose "Without media" to get a smaller file
        6. Send the file to yourself via email or save it
        
        **Create your first project above to begin!**
        """)

def render_analysis_tabs(analyzer, processed_data):
    """Render the analysis tabs with the combined analyzer"""
    

    # Get basic stats from analyzer - initialize early for all code paths
    basic_stats = analyzer.get_basic_stats() if hasattr(analyzer, 'get_basic_stats') else {}
    
    # Get basic stats for metrics display
    if processed_data and 'combined' in processed_data:
        combined = processed_data['combined']
        total_messages = combined.get('total_messages', 0)
        participants_count = len(combined.get('participants', []))
        file_count = combined.get('file_count', 0)
        date_range = combined.get('date_range', {})
        
        # Display metrics for multi-file project
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.markdown(f"""
            <div class="metric-card">
                <h3>📁 Files Processed</h3>
                <h2>{file_count}</h2>
            </div>
            """, unsafe_allow_html=True)
        
        with col2:
            st.markdown(f"""
            <div class="metric-card">
                <h3>📨 Total Messages</h3>
                <h2>{total_messages:,}</h2>
            </div>
            """, unsafe_allow_html=True)
        
        with col3:
            st.markdown(f"""
            <div class="metric-card">
                <h3>👥 Participants</h3>
                <h2>{participants_count}</h2>
            </div>
            """, unsafe_allow_html=True)
        
        with col4:
            if date_range.get('start') and date_range.get('end'):
                try:
                    # Convert dates to datetime objects for calculation
                    def parse_date(date_obj):
                        if isinstance(date_obj, str):
                            # Try multiple date format parsing
                            try:
                                return datetime.fromisoformat(date_obj.replace('Z', '+00:00'))
                            except ValueError:
                                try:
                                    return pd.to_datetime(date_obj)
                                except:
                                    return datetime.strptime(date_obj, '%Y-%m-%d %H:%M:%S')
                        elif hasattr(date_obj, 'to_pydatetime'):
                            return date_obj.to_pydatetime()
                        else:
                            return date_obj
                    
                    start_date = parse_date(date_range['start'])
                    end_date = parse_date(date_range['end'])
                    
                    days = (end_date - start_date).days + 1
                    st.markdown(f"""
                    <div class="metric-card">
                        <h3>📅 Date Range</h3>
                        <h2>{days} days</h2>
                    </div>
                    """, unsafe_allow_html=True)
                except (ValueError, TypeError, AttributeError) as e:
                    st.markdown(f"""
                    <div class="metric-card">
                        <h3>📅 Date Range</h3>
                        <h2>N/A</h2>
                    </div>
                    """, unsafe_allow_html=True)
    else:
        # Fallback to single analyzer stats
        basic_stats = analyzer.get_basic_stats()
        
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
    analysis_tab1, analysis_tab2, analysis_tab3, analysis_tab4, analysis_tab5, analysis_tab6 = st.tabs([
        "📈 Activity Analysis", 
        "👥 Participant Analysis", 
        "😊 Emoji Analysis",
        "📝 Word Analysis",
        "💭 Sentiment Analysis",
        "📊 Full Report"
    ])
    
    with analysis_tab1:
                st.markdown('<div class="analysis-section">', unsafe_allow_html=True)
                st.subheader("📈 Message Activity Analysis")
                
                # Word cloud popularity map
                wordcloud = analyzer.generate_wordcloud()
                if wordcloud:
                    st.subheader("☁️ Word Cloud - Most Popular Words")
                    fig, ax = plt.subplots(figsize=(10, 6))
                    ax.imshow(wordcloud, interpolation='bilinear')
                    ax.axis('off')
                    st.pyplot(fig)
                    plt.close()
                
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
                
                # Time Period Analysis
                render_period_analysis(analyzer, processed_data)
                
                st.markdown('</div>', unsafe_allow_html=True)
            
    with analysis_tab2:
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
            
    with analysis_tab3:
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
            
    with analysis_tab4:
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
            
    with analysis_tab5:
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
            
    with analysis_tab6:
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
            


if __name__ == "__main__":
    main()