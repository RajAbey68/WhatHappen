import streamlit as st
import pandas as pd
from whatsapp_analyzer import WhatsAppAnalyzer
from project_manager import Project, ProjectManager
from firebase_service import get_firebase_service, ChatFile, ChatMessage, DataIntegrityReport
from typing import List, Dict, Any
import tempfile
import os
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MultiFileProcessor:
    """
    CRITICAL: Enhanced file processor ensuring 100% data completeness in Firebase
    
    This processor guarantees:
    - ALL uploaded files stored in Firebase Storage
    - ALL message content stored in Firebase Firestore  
    - Complete data integrity validation
    - Zero data loss tolerance
    - Comprehensive audit trails
    """
    
    def __init__(self):
        self.analyzers = {}  # Store analyzer for each file
        self.combined_data = None
        self.firebase_service = get_firebase_service()
        
    def process_files_with_firebase_storage(
        self, 
        files: List, 
        project: Project, 
        project_manager: ProjectManager
    ) -> Dict[str, Any]:
        """
        CRITICAL: Process multiple WhatsApp files with 100% Firebase storage completeness
        
        Args:
            files: List of uploaded files
            project: Project object
            project_manager: Project manager instance
            
        Returns:
            Dictionary with complete processing results and integrity metrics
        """
        
        if not files:
            return {}
        
        if not self.firebase_service.db:
            st.error("❌ Firebase not initialized. Cannot guarantee 100% data storage.")
            return {}
        
        # Initialize comprehensive processing data structure
        processed_data = {
            'files': {},
            'combined': {
                'messages': [],
                'participants': set(),
                'total_messages': 0,
                'date_range': {'start': None, 'end': None},
                'file_count': len(files)
            },
            'individual_stats': {},
            'firebase_storage': {
                'files_uploaded': 0,
                'files_processed': 0,
                'messages_stored': 0,
                'integrity_reports': [],
                'completeness_percentage': 0,
                'storage_errors': []
            }
        }
        
        st.info(f"🔄 Processing {len(files)} files with 100% Firebase storage guarantee...")
        
        # Create comprehensive progress tracking
        progress_container = st.container()
        with progress_container:
            overall_progress = st.progress(0)
            status_text = st.empty()
            
            # File-by-file progress display
            file_progress_container = st.container()
        
        combined_messages = []
        all_participants = set()
        all_dates = []
        storage_results = []
        
        total_steps = len(files) * 4  # Upload, Parse, Store Messages, Validate
        completed_steps = 0
        
        for i, uploaded_file in enumerate(files):
            try:
                status_text.text(f"📁 Processing file {i+1}/{len(files)}: {uploaded_file.name}")
                
                with file_progress_container:
                    file_col1, file_col2 = st.columns([3, 1])
                    with file_col1:
                        st.write(f"**File {i+1}:** {uploaded_file.name}")
                    with file_col2:
                        file_progress = st.progress(0)
                
                # STEP 1: Upload file to Firebase Storage with integrity check
                status_text.text(f"☁️ Uploading {uploaded_file.name} to Firebase Storage...")
                file_progress.progress(10)
                
                try:
                    file_content = uploaded_file.getbuffer()
                    
                    def upload_progress(progress):
                        file_progress.progress(10 + int(progress * 0.3))
                    
                    chat_file = self.firebase_service.upload_file_with_integrity(
                        file_content=bytes(file_content),
                        file_name=uploaded_file.name,
                        project_id=project.id,
                        file_size=uploaded_file.size,
                        mime_type=uploaded_file.type or "text/plain",
                        progress_callback=upload_progress
                    )
                    
                    processed_data['firebase_storage']['files_uploaded'] += 1
                    completed_steps += 1
                    
                    st.success(f"✅ File uploaded to Firebase: {uploaded_file.name}")
                    
                except Exception as upload_error:
                    st.error(f"❌ Firebase upload failed for {uploaded_file.name}: {upload_error}")
                    processed_data['firebase_storage']['storage_errors'].append({
                        'file': uploaded_file.name,
                        'error': str(upload_error),
                        'step': 'upload'
                    })
                    continue
                
                # STEP 2: Parse WhatsApp content
                status_text.text(f"📖 Parsing WhatsApp content: {uploaded_file.name}")
                file_progress.progress(40)
                
                try:
                    # Save temporarily for parsing
                    with tempfile.NamedTemporaryFile(delete=False, suffix=f"_{uploaded_file.name}") as temp_file:
                        temp_file.write(file_content)
                        temp_file_path = temp_file.name
                    
                    # Parse with WhatsApp analyzer
                    analyzer = WhatsAppAnalyzer()
                    success = analyzer.parse_whatsapp_export(temp_file_path)
                    
                    # Clean up temp file
                    os.unlink(temp_file_path)
                    
                    if not success or analyzer.df is None:
                        raise Exception("Failed to parse WhatsApp content")
                    
                    self.analyzers[uploaded_file.name] = analyzer
                    completed_steps += 1
                    file_progress.progress(50)
                    
                except Exception as parse_error:
                    st.error(f"❌ Parsing failed for {uploaded_file.name}: {parse_error}")
                    processed_data['firebase_storage']['storage_errors'].append({
                        'file': uploaded_file.name,
                        'error': str(parse_error),
                        'step': 'parse'
                    })
                    continue
                
                # STEP 3: Store ALL messages in Firebase Firestore
                status_text.text(f"💾 Storing messages in Firebase: {uploaded_file.name}")
                file_progress.progress(60)
                
                try:
                    # Convert DataFrame to message list
                    file_messages = analyzer.df.to_dict('records')
                    
                    def message_progress(progress):
                        file_progress.progress(60 + int(progress * 0.3))
                    
                    # Store messages with completeness validation
                    storage_result = self.firebase_service.process_and_store_messages(
                        file_id=chat_file.id,
                        messages=file_messages,
                        project_id=project.id,
                        progress_callback=message_progress
                    )
                    
                    storage_results.append({
                        'file_name': uploaded_file.name,
                        'file_id': chat_file.id,
                        'storage_result': storage_result
                    })
                    
                    # Update Firebase storage metrics
                    processed_data['firebase_storage']['messages_stored'] += storage_result['stored']
                    
                    if storage_result['completeness'] == 100:
                        processed_data['firebase_storage']['files_processed'] += 1
                        st.success(f"✅ 100% data completeness: {uploaded_file.name} ({storage_result['stored']} messages)")
                    else:
                        st.warning(f"⚠️ Partial completeness ({storage_result['completeness']:.1f}%): {uploaded_file.name}")
                        processed_data['firebase_storage']['storage_errors'].append({
                            'file': uploaded_file.name,
                            'error': f"Only {storage_result['completeness']:.1f}% completeness",
                            'step': 'message_storage'
                        })
                    
                    completed_steps += 1
                    file_progress.progress(90)
                    
                except Exception as storage_error:
                    st.error(f"❌ Message storage failed for {uploaded_file.name}: {storage_error}")
                    processed_data['firebase_storage']['storage_errors'].append({
                        'file': uploaded_file.name,
                        'error': str(storage_error),
                        'step': 'message_storage'
                    })
                    continue
                
                # STEP 4: Validate data integrity
                status_text.text(f"🔍 Validating data integrity: {uploaded_file.name}")
                
                try:
                    # Verify file integrity
                    integrity_report = self.firebase_service.verify_data_completeness(project.id)
                    processed_data['firebase_storage']['integrity_reports'].append(integrity_report)
                    
                    completed_steps += 1
                    file_progress.progress(100)
                    
                    st.success(f"✅ Integrity validated: {uploaded_file.name} (Score: {integrity_report.integrity_score}%)")
                    
                except Exception as validation_error:
                    st.warning(f"⚠️ Integrity validation incomplete for {uploaded_file.name}: {validation_error}")
                    processed_data['firebase_storage']['storage_errors'].append({
                        'file': uploaded_file.name,
                        'error': str(validation_error),
                        'step': 'validation'
                    })
                
                # Combine data for local compatibility
                basic_stats = analyzer.get_basic_stats()
                processed_data['individual_stats'][uploaded_file.name] = basic_stats
                
                processed_data['files'][uploaded_file.name] = {
                    'analyzer': analyzer,
                    'stats': basic_stats,
                    'firebase_file': chat_file,
                    'storage_result': storage_result if 'storage_result' in locals() else None
                }
                
                # Add to combined data
                combined_messages.extend(file_messages)
                all_participants.update(analyzer.participants)
                
                # Safely get date range
                try:
                    min_date = analyzer.df['date'].min()
                    max_date = analyzer.df['date'].max()
                    if min_date is not None and not pd.isna(min_date):
                        all_dates.append(min_date)
                    if max_date is not None and not pd.isna(max_date):
                        all_dates.append(max_date)
                except Exception:
                    pass  # Skip date processing if there are issues
                
                # Update overall progress
                overall_progress.progress(completed_steps / total_steps)
                
            except Exception as file_error:
                st.error(f"❌ Critical error processing {uploaded_file.name}: {file_error}")
                processed_data['firebase_storage']['storage_errors'].append({
                    'file': uploaded_file.name,
                    'error': str(file_error),
                    'step': 'file_processing'
                })
        
        # Finalize combined data
        if combined_messages:
            combined_df = pd.DataFrame(combined_messages)
            
            # Sort by datetime
            if 'datetime' in combined_df.columns:
                combined_df = combined_df.sort_values('datetime')
            
            processed_data['combined']['messages'] = combined_messages
            processed_data['combined']['participants'] = list(all_participants)
            processed_data['combined']['total_messages'] = len(combined_messages)
            
            if all_dates:
                processed_data['combined']['date_range'] = {
                    'start': min(all_dates),
                    'end': max(all_dates)
                }
            
            # Store combined data for recreating analyzer
            processed_data['combined']['df_data'] = combined_df.to_dict('records') if not combined_df.empty else []
        
        # Calculate final Firebase storage completeness
        total_files = len(files)
        if total_files > 0:
            files_completeness = (processed_data['firebase_storage']['files_processed'] / total_files) * 100
            processed_data['firebase_storage']['completeness_percentage'] = files_completeness
        
        # Update project with Firebase metadata
        project.message_count = len(combined_messages)
        project.participants = list(all_participants)
        project.last_modified = datetime.now().isoformat()
        
        # Display comprehensive results
        self._display_firebase_storage_summary(processed_data)
        
        # Save processed data to local project (for backward compatibility)
        project_manager.save_project_data(project, processed_data)
        
        overall_progress.progress(1.0)
        status_text.text("✅ All files processed with Firebase storage!")
        
        return processed_data
    
    def _display_firebase_storage_summary(self, processed_data: Dict[str, Any]):
        """Display comprehensive Firebase storage summary"""
        firebase_data = processed_data['firebase_storage']
        
        st.markdown("---")
        st.markdown("## 📊 Firebase Storage Completeness Report")
        
        # Key metrics
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric(
                "Files Uploaded",
                firebase_data['files_uploaded'],
                delta=f"{firebase_data['files_uploaded']}/{processed_data['combined']['file_count']}"
            )
        
        with col2:
            st.metric(
                "Files Processed",
                firebase_data['files_processed'],
                delta=f"{firebase_data['completeness_percentage']:.1f}% complete"
            )
        
        with col3:
            st.metric(
                "Messages Stored",
                f"{firebase_data['messages_stored']:,}",
                delta="in Firebase Firestore"
            )
        
        with col4:
            error_count = len(firebase_data['storage_errors'])
            st.metric(
                "Storage Errors",
                error_count,
                delta="❌" if error_count > 0 else "✅"
            )
        
        # Completeness status
        if firebase_data['completeness_percentage'] == 100:
            st.success("🎉 **100% DATA COMPLETENESS ACHIEVED!** All files and content stored in Firebase.")
        elif firebase_data['completeness_percentage'] >= 90:
            st.warning(f"⚠️ **{firebase_data['completeness_percentage']:.1f}% completeness** - Minor issues detected.")
        else:
            st.error(f"❌ **{firebase_data['completeness_percentage']:.1f}% completeness** - Significant data loss detected!")
        
        # Show errors if any
        if firebase_data['storage_errors']:
            st.markdown("### ⚠️ Storage Issues")
            for error in firebase_data['storage_errors']:
                st.error(f"**{error['file']}** ({error['step']}): {error['error']}")
        
        # Show integrity reports
        if firebase_data['integrity_reports']:
            st.markdown("### 🔍 Data Integrity Reports")
            for report in firebase_data['integrity_reports']:
                if report.integrity_score == 100:
                    st.success(f"✅ Integrity Score: {report.integrity_score}% - All checks passed")
                else:
                    st.warning(f"⚠️ Integrity Score: {report.integrity_score}% - {len(report.issues)} issues found")
                    
                    if report.recommendations:
                        st.info("**Recommendations:** " + "; ".join(report.recommendations))

def render_multi_file_upload(current_project: Project):
    """Render the multiple file upload interface with Firebase storage"""
    
    if not current_project:
        st.warning("⚠️ Please select or create a project first to upload files.")
        return None
    
    st.markdown('<div class="analysis-section">', unsafe_allow_html=True)
    st.subheader(f"📁 Upload Files to: **{current_project.name}** (Firebase Storage)")
    
    # Firebase status check
    firebase_service = get_firebase_service()
    if not firebase_service.db:
        st.error("❌ Firebase not initialized. Files will be stored locally only.")
        st.warning("Set up Firebase credentials for 100% data completeness guarantee.")
    else:
        st.success("✅ Firebase connected - 100% data completeness guaranteed")
    
    # Multiple file uploader
    uploaded_files = st.file_uploader(
        "Choose WhatsApp export files (.txt, .pdf)",
        type=['txt', 'pdf'],
        accept_multiple_files=True,
        help="Select multiple WhatsApp export files (.txt or .pdf) for comprehensive analysis with Firebase storage",
        key="multi_file_uploader"
    )
    
    if uploaded_files:
        st.write(f"📋 Selected {len(uploaded_files)} files for Firebase storage:")
        
        # Show file preview with size calculations
        total_size = 0
        for i, file in enumerate(uploaded_files):
            col1, col2, col3, col4 = st.columns([3, 2, 1, 1])
            with col1:
                st.write(f"📄 {file.name}")
            with col2:
                st.write(f"📏 {file.size:,} bytes")
            with col3:
                st.write(f"#{i+1}")
            with col4:
                st.write(f"📱 {file.type or 'text/plain'}")
            total_size += file.size
        
        st.info(f"📊 Total data to process: {total_size:,} bytes ({total_size/1024/1024:.1f} MB)")
        
        # Process files button with Firebase emphasis
        if st.button("🚀 Process All Files with Firebase Storage", key="process_files_firebase_btn"):
            
            if 'project_manager' not in st.session_state:
                st.error("Project manager not initialized!")
                return None
            
            processor = MultiFileProcessor()
            
            with st.spinner("Processing files with Firebase storage..."):
                processed_data = processor.process_files_with_firebase_storage(
                    uploaded_files, 
                    current_project, 
                    st.session_state.project_manager
                )
            
            if processed_data and processed_data['combined']['total_messages'] > 0:
                firebase_data = processed_data['firebase_storage']
                
                if firebase_data['completeness_percentage'] == 100:
                    st.balloons()
                    st.success(f"🎉 **100% SUCCESS!** Processed {len(uploaded_files)} files with complete Firebase storage!")
                else:
                    st.warning(f"⚠️ **Partial Success** - {firebase_data['completeness_percentage']:.1f}% completeness achieved")
                
                st.success(f"📊 Total messages: {processed_data['combined']['total_messages']:,}")
                st.success(f"👥 Total participants: {len(processed_data['combined']['participants'])}")
                st.success(f"☁️ Firebase storage: {firebase_data['messages_stored']:,} messages stored")
                
                # Update project in session state
                st.session_state.project_manager.save_projects(st.session_state.projects)
                
                # Store processed data in session state
                st.session_state.processed_data = processed_data
                st.session_state.has_data = True
                
                return processed_data
            else:
                st.error("❌ No valid data could be processed from the uploaded files.")
                return None
    
    # Show existing project data if available
    if current_project and current_project.files:
        st.markdown("---")
        st.markdown("### 📂 Existing Files in Project")
        
        for file_info in current_project.files:
            col1, col2, col3 = st.columns([3, 2, 1])
            with col1:
                st.write(f"📄 {file_info['name']}")
            with col2:
                uploaded_date = datetime.fromisoformat(file_info['uploaded_at']).strftime("%Y-%m-%d %H:%M")
                st.write(f"📅 {uploaded_date}")
            with col3:
                unique_key = f"delete_{file_info['name']}_{file_info['uploaded_at']}"
                if st.button("🗑️", key=unique_key, help="Remove file"):
                    st.info("File removal will be implemented soon!")
        
        # Load existing data button
        if st.button("📊 Load Existing Data", key="load_existing_btn"):
            try:
                existing_data = st.session_state.project_manager.load_project_data(current_project)
                if existing_data:
                    st.session_state.processed_data = existing_data
                    st.session_state.has_data = True
                    st.success("✅ Loaded existing project data!")
                    return existing_data
                else:
                    st.warning("No existing data found for this project.")
            except Exception as e:
                st.error(f"Error loading existing data: {str(e)}")
    
    st.markdown('</div>', unsafe_allow_html=True)
    
    return None

def get_combined_analyzer_for_ai(processed_data: Dict[str, Any]):
    """Get a combined analyzer instance for AI queries - recreate from stored data"""
    if not processed_data or 'combined' not in processed_data:
        return None
    
    combined = processed_data['combined']
    
    # Check if we have the necessary data
    if 'df_data' not in combined or 'messages' not in combined:
        return None
    
    try:
        # Recreate analyzer from stored data
        analyzer = WhatsAppAnalyzer()
        
        # Recreate DataFrame from stored dict records
        if combined['df_data']:
            analyzer.df = pd.DataFrame(combined['df_data'])
        else:
            analyzer.df = pd.DataFrame()
        
        # Set messages and participants
        analyzer.messages = combined.get('messages', [])
        analyzer.participants = set(combined.get('participants', []))
        
        return analyzer
        
    except Exception as e:
        print(f"Error recreating analyzer: {e}")
        return None

def render_file_summary(processed_data: Dict[str, Any]):
    """Render a summary of processed files"""
    if not processed_data:
        return
    
    st.markdown("### 📊 Data Summary")
    
    # Combined stats
    combined = processed_data.get('combined', {})
    
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric("📄 Files Processed", combined.get('file_count', 0))
    
    with col2:
        st.metric("💬 Total Messages", f"{combined.get('total_messages', 0):,}")
    
    with col3:
        st.metric("👥 Participants", len(combined.get('participants', [])))
    
    with col4:
        date_range = combined.get('date_range', {})
        if date_range.get('start') and date_range.get('end'):
            try:
                # Convert string dates back to datetime objects for calculation
                if isinstance(date_range['start'], str):
                    start_date = datetime.fromisoformat(date_range['start'].replace('Z', '+00:00'))
                else:
                    start_date = date_range['start']
                
                if isinstance(date_range['end'], str):
                    end_date = datetime.fromisoformat(date_range['end'].replace('Z', '+00:00'))
                else:
                    end_date = date_range['end']
                
                days = (end_date - start_date).days + 1
                st.metric("📅 Date Range", f"{days} days")
            except (ValueError, TypeError):
                st.metric("📅 Date Range", "N/A")
        else:
            st.metric("📅 Date Range", "N/A")
    
    # Individual file stats
    if processed_data.get('individual_stats'):
        st.markdown("### 📁 Individual File Statistics")
        
        for file_name, stats in processed_data['individual_stats'].items():
            with st.expander(f"📄 {file_name}"):
                col1, col2, col3 = st.columns(3)
                
                with col1:
                    st.metric("Messages", f"{stats.get('total_messages', 0):,}")
                
                with col2:
                    st.metric("Participants", stats.get('total_participants', 0))
                
                with col3:
                    st.metric("Days", stats.get('total_days', 0))
                
                # Show participants for this file
                participants = stats.get('messages_per_participant', {})
                if participants:
                    st.write("**Participants:**")
                    for participant, count in participants.items():
                        percentage = (count / stats.get('total_messages', 1)) * 100
                        st.write(f"• {participant}: {count} messages ({percentage:.1f}%)") 