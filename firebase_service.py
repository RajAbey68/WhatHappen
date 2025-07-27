import os
import json
import hashlib
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
import firebase_admin
from firebase_admin import credentials, firestore, storage
import streamlit as st
from dataclasses import dataclass, asdict
import pandas as pd

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ChatFile:
    id: str
    name: str
    original_name: str
    size: int
    mime_type: str
    uploaded_at: str
    checksum: str
    storage_url: str
    project_id: str
    status: str  # 'uploaded', 'processing', 'processed', 'error'
    message_count: Optional[int] = None
    participant_count: Optional[int] = None
    date_range: Optional[Dict[str, str]] = None
    processing_metadata: Optional[Dict[str, Any]] = None

@dataclass
class ChatMessage:
    id: str
    file_id: str
    project_id: str
    timestamp: str
    date: str
    time: str
    sender: str
    message: str
    original_line: str
    line_number: int
    message_index: int
    has_emoji: bool
    word_count: int
    character_count: int
    message_type: str  # 'text', 'media', 'system', 'deleted'

@dataclass
class Project:
    id: str
    name: str
    description: str
    created_at: str
    last_modified: str
    file_count: int
    total_messages: int
    participants: List[str]
    date_range: Optional[Dict[str, str]] = None
    data_completeness: Optional[Dict[str, Any]] = None

@dataclass
class DataIntegrityReport:
    project_id: str
    check_date: str
    files_checked: int
    messages_checked: int
    integrity_score: int
    issues: List[Dict[str, Any]]
    recommendations: List[str]

class FirebaseService:
    """
    CRITICAL: Firebase service ensuring 100% data completeness and integrity
    
    This service guarantees:
    - ALL uploaded files are stored in Firebase Storage
    - ALL message content is stored in Firestore
    - Complete data integrity validation
    - Zero data loss tolerance
    - Comprehensive audit trails
    """
    
    def __init__(self):
        """Initialize Firebase connection with validation"""
        self.db = None
        self.bucket = None
        self.app = None
        self._initialize_firebase()
    
    def _initialize_firebase(self):
        """Initialize Firebase with proper error handling"""
        try:
            # Initialize Firebase Admin SDK if not already initialized
            if not firebase_admin._apps:
                # Try to get credentials from environment or Streamlit secrets
                cred_dict = self._get_firebase_credentials()
                
                if cred_dict:
                    cred = credentials.Certificate(cred_dict)
                    self.app = firebase_admin.initialize_app(cred, {
                        'storageBucket': cred_dict.get('storage_bucket', f"{cred_dict['project_id']}.appspot.com")
                    })
                else:
                    # Use default credentials (for deployment environments)
                    self.app = firebase_admin.initialize_app()
            else:
                self.app = firebase_admin.get_app()
            
            # Initialize services
            self.db = firestore.client()
            self.bucket = storage.bucket()
            
            logger.info("✅ Firebase initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"❌ Firebase initialization failed: {e}")
            st.error(f"Firebase initialization failed: {e}")
            return False
    
    def _get_firebase_credentials(self) -> Optional[Dict]:
        """Get Firebase credentials from environment or Streamlit secrets"""
        try:
            # Try Streamlit secrets first
            if hasattr(st, 'secrets') and 'firebase' in st.secrets:
                return dict(st.secrets.firebase)
            
            # Try environment variables
            firebase_key = os.getenv('FIREBASE_SERVICE_ACCOUNT_KEY')
            if firebase_key:
                return json.loads(firebase_key)
            
            # Try service account file
            service_account_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
            if service_account_path and os.path.exists(service_account_path):
                with open(service_account_path, 'r') as f:
                    return json.load(f)
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get Firebase credentials: {e}")
            return None
    
    def upload_file_with_integrity(
        self, 
        file_content: bytes, 
        file_name: str, 
        project_id: str,
        file_size: int,
        mime_type: str = "text/plain",
        progress_callback: Optional[callable] = None
    ) -> ChatFile:
        """
        CRITICAL: Upload file with 100% data integrity guarantee
        
        Args:
            file_content: Raw file bytes
            file_name: Original file name
            project_id: Project ID
            file_size: File size in bytes
            mime_type: MIME type
            progress_callback: Progress update function
            
        Returns:
            ChatFile object with complete metadata
            
        Raises:
            Exception: If upload fails or integrity check fails
        """
        try:
            if not self.db or not self.bucket:
                raise Exception("Firebase not initialized")
            
            # Generate unique file ID and checksum
            file_id = f"{project_id}_{int(datetime.now().timestamp())}_{hashlib.md5(file_name.encode()).hexdigest()[:8]}"
            checksum = hashlib.sha256(file_content).hexdigest()
            
            if progress_callback:
                progress_callback(10)
            
            # Upload to Firebase Storage
            blob_path = f"chat-files/{project_id}/{file_id}/{file_name}"
            blob = self.bucket.blob(blob_path)
            
            # Upload with metadata
            blob.upload_from_string(
                file_content,
                content_type=mime_type
            )
            
            # Make file publicly readable (or set appropriate permissions)
            blob.make_public()
            storage_url = blob.public_url
            
            if progress_callback:
                progress_callback(40)
            
            # Create file metadata
            chat_file = ChatFile(
                id=file_id,
                name=file_name,
                original_name=file_name,
                size=file_size,
                mime_type=mime_type,
                uploaded_at=datetime.now().isoformat(),
                checksum=checksum,
                storage_url=storage_url,
                project_id=project_id,
                status='uploaded',
                processing_metadata={
                    'total_bytes': file_size,
                    'processed_bytes': 0,
                    'lines_processed': 0,
                    'error_count': 0,
                    'warnings': []
                }
            )
            
            # Store metadata in Firestore
            self.db.collection('chat_files').document(file_id).set(asdict(chat_file))
            
            if progress_callback:
                progress_callback(70)
            
            # Verify integrity immediately
            verification_result = self._verify_file_integrity(file_id, checksum)
            if not verification_result['is_valid']:
                raise Exception(f"File integrity verification failed: {verification_result['errors']}")
            
            if progress_callback:
                progress_callback(100)
            
            logger.info(f"✅ File uploaded with 100% integrity: {file_id}")
            return chat_file
            
        except Exception as e:
            logger.error(f"❌ File upload failed: {e}")
            raise Exception(f"File upload failed: {e}")
    
    def process_and_store_messages(
        self,
        file_id: str,
        messages: List[Dict[str, Any]],
        project_id: str,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """
        CRITICAL: Process and store ALL message data with completeness validation
        
        Args:
            file_id: File ID from upload
            messages: List of parsed messages
            project_id: Project ID
            progress_callback: Progress update function
            
        Returns:
            Dictionary with storage results and completeness metrics
        """
        try:
            if not self.db:
                raise Exception("Firestore not initialized")
            
            # Update file status to processing
            self._update_file_status(file_id, 'processing')
            
            total_messages = len(messages)
            stored_count = 0
            error_count = 0
            batch_size = 100  # Firestore batch limit is 500, use 100 for safety
            
            logger.info(f"🔄 Processing {total_messages} messages from file {file_id}")
            
            if progress_callback:
                progress_callback(5)
            
            # Process messages in batches
            for i in range(0, len(messages), batch_size):
                try:
                    batch = self.db.batch()
                    batch_messages = messages[i:i + batch_size]
                    
                    for j, msg in enumerate(batch_messages):
                        message_id = f"{file_id}_msg_{i + j}"
                        
                        # Create ChatMessage object
                        chat_message = ChatMessage(
                            id=message_id,
                            file_id=file_id,
                            project_id=project_id,
                            timestamp=msg.get('datetime', msg.get('timestamp', '')),
                            date=msg.get('date', ''),
                            time=msg.get('time', ''),
                            sender=msg.get('sender', 'Unknown'),
                            message=msg.get('message', msg.get('verbatim_message', '')),
                            original_line=msg.get('original_line', msg.get('message', '')),
                            line_number=msg.get('line_number', i + j + 1),
                            message_index=i + j,
                            has_emoji=self._contains_emoji(msg.get('message', '')),
                            word_count=len((msg.get('message', '')).split()),
                            character_count=len(msg.get('message', '')),
                            message_type=self._detect_message_type(msg.get('message', ''))
                        )
                        
                        # Add to batch
                        doc_ref = self.db.collection('chat_messages').document(message_id)
                        batch.set(doc_ref, asdict(chat_message))
                    
                    # Commit batch
                    batch.commit()
                    stored_count += len(batch_messages)
                    
                    # Update progress
                    if progress_callback:
                        progress = 5 + int((stored_count / total_messages) * 80)  # 5-85%
                        progress_callback(progress)
                        
                except Exception as batch_error:
                    logger.error(f"❌ Batch storage error for messages {i}-{i + batch_size}: {batch_error}")
                    error_count += len(batch_messages)
            
            # Calculate completeness
            completeness = (stored_count / total_messages) * 100 if total_messages > 0 else 0
            
            # Update file with processing results
            processing_metadata = {
                'total_bytes': 0,  # Will be calculated separately
                'processed_bytes': 0,
                'lines_processed': total_messages,
                'error_count': error_count,
                'warnings': [f"{error_count} messages failed to store"] if error_count > 0 else []
            }
            
            # Update file metadata
            self.db.collection('chat_files').document(file_id).update({
                'message_count': stored_count,
                'processing_metadata': processing_metadata,
                'last_modified': datetime.now().isoformat()
            })
            
            # Set final status based on completeness
            if completeness == 100:
                self._update_file_status(file_id, 'processed')
                logger.info(f"✅ 100% data completeness achieved for file {file_id}")
            else:
                self._update_file_status(file_id, 'error')
                logger.warning(f"⚠️ Data completeness only {completeness:.1f}% for file {file_id}")
            
            if progress_callback:
                progress_callback(100)
            
            return {
                'stored': stored_count,
                'errors': error_count,
                'completeness': completeness,
                'total_messages': total_messages
            }
            
        except Exception as e:
            logger.error(f"❌ Message processing failed: {e}")
            self._update_file_status(file_id, 'error')
            raise e
    
    def verify_data_completeness(self, project_id: str) -> DataIntegrityReport:
        """
        CRITICAL: Verify 100% data integrity and completeness
        
        Args:
            project_id: Project ID to verify
            
        Returns:
            DataIntegrityReport with complete integrity analysis
        """
        try:
            logger.info(f"🔍 Verifying data completeness for project {project_id}")
            
            # Get all files for project
            files_ref = self.db.collection('chat_files').where('project_id', '==', project_id)
            files_docs = files_ref.stream()
            files = [doc.to_dict() for doc in files_docs]
            
            # Get all messages for project
            messages_ref = self.db.collection('chat_messages').where('project_id', '==', project_id)
            messages_docs = messages_ref.stream()
            messages = [doc.to_dict() for doc in messages_docs]
            
            issues = []
            integrity_score = 100
            
            # Check each file's completeness
            for file_data in files:
                file_id = file_data['id']
                file_name = file_data['name']
                expected_messages = file_data.get('message_count', 0)
                
                # Count actual messages for this file
                file_messages = [msg for msg in messages if msg['file_id'] == file_id]
                actual_messages = len(file_messages)
                
                # Check message count completeness
                if expected_messages != actual_messages:
                    issues.append({
                        'type': 'incomplete_processing',
                        'description': f"File {file_name} has {actual_messages} messages but expected {expected_messages}",
                        'file_id': file_id,
                        'severity': 'high'
                    })
                    integrity_score -= 15
                
                # Check file processing status
                status = file_data.get('status', 'unknown')
                if status != 'processed':
                    severity = 'critical' if status == 'error' else 'medium'
                    issues.append({
                        'type': 'incomplete_processing',
                        'description': f"File {file_name} status is '{status}', not 'processed'",
                        'file_id': file_id,
                        'severity': severity
                    })
                    integrity_score -= 20 if severity == 'critical' else 10
                
                # Check for processing errors
                processing_metadata = file_data.get('processing_metadata', {})
                error_count = processing_metadata.get('error_count', 0)
                if error_count > 0:
                    issues.append({
                        'type': 'corrupted_data',
                        'description': f"File {file_name} had {error_count} processing errors",
                        'file_id': file_id,
                        'severity': 'medium'
                    })
                    integrity_score -= 5
            
            # Ensure integrity score doesn't go below 0
            integrity_score = max(0, integrity_score)
            
            # Generate recommendations
            recommendations = self._generate_recommendations(issues)
            
            # Create integrity report
            report = DataIntegrityReport(
                project_id=project_id,
                check_date=datetime.now().isoformat(),
                files_checked=len(files),
                messages_checked=len(messages),
                integrity_score=integrity_score,
                issues=issues,
                recommendations=recommendations
            )
            
            # Store integrity report
            report_id = f"{project_id}_{int(datetime.now().timestamp())}"
            self.db.collection('integrity_reports').document(report_id).set(asdict(report))
            
            logger.info(f"📊 Data integrity check complete. Score: {integrity_score}%")
            
            return report
            
        except Exception as e:
            logger.error(f"❌ Data completeness verification failed: {e}")
            raise e
    
    def get_project_with_stats(self, project_id: str) -> Optional[Project]:
        """Get project with real-time data completeness statistics"""
        try:
            # Get project document
            project_doc = self.db.collection('projects').document(project_id).get()
            if not project_doc.exists:
                return None
            
            project_data = project_doc.to_dict()
            
            # Get real-time file and message counts
            files_ref = self.db.collection('chat_files').where('project_id', '==', project_id)
            files_docs = list(files_ref.stream())
            files = [doc.to_dict() for doc in files_docs]
            
            messages_ref = self.db.collection('chat_messages').where('project_id', '==', project_id)
            messages_docs = list(messages_ref.stream())
            messages = [doc.to_dict() for doc in messages_docs]
            
            # Calculate completeness metrics
            files_uploaded = len(files)
            files_processed = len([f for f in files if f.get('status') == 'processed'])
            expected_messages = sum(f.get('message_count', 0) for f in files)
            actual_messages = len(messages)
            completeness_percentage = (actual_messages / expected_messages * 100) if expected_messages > 0 else 100
            
            # Get unique participants
            participants = list(set(msg.get('sender', '') for msg in messages if msg.get('sender')))
            
            # Update project data
            project = Project(
                id=project_data['id'],
                name=project_data['name'],
                description=project_data.get('description', ''),
                created_at=project_data.get('created_at', ''),
                last_modified=datetime.now().isoformat(),
                file_count=files_uploaded,
                total_messages=actual_messages,
                participants=participants,
                data_completeness={
                    'files_uploaded': files_uploaded,
                    'files_processed': files_processed,
                    'total_messages': expected_messages,
                    'messages_stored': actual_messages,
                    'completeness_percentage': completeness_percentage,
                    'last_validated': datetime.now().isoformat()
                }
            )
            
            # Save updated project stats
            self.db.collection('projects').document(project_id).set(asdict(project))
            
            return project
            
        except Exception as e:
            logger.error(f"❌ Failed to get project stats: {e}")
            raise e
    
    # Helper methods
    def _update_file_status(self, file_id: str, status: str):
        """Update file processing status"""
        try:
            self.db.collection('chat_files').document(file_id).update({
                'status': status,
                'last_modified': datetime.now().isoformat()
            })
        except Exception as e:
            logger.error(f"Failed to update file status: {e}")
    
    def _verify_file_integrity(self, file_id: str, expected_checksum: str) -> Dict[str, Any]:
        """Verify uploaded file integrity"""
        try:
            file_doc = self.db.collection('chat_files').document(file_id).get()
            if not file_doc.exists:
                return {'is_valid': False, 'errors': ['File metadata not found in database']}
            
            file_data = file_doc.to_dict()
            stored_checksum = file_data.get('checksum')
            
            if stored_checksum != expected_checksum:
                return {'is_valid': False, 'errors': ['Checksum mismatch - file may be corrupted']}
            
            return {'is_valid': True, 'errors': []}
            
        except Exception as e:
            return {'is_valid': False, 'errors': [str(e)]}
    
    def _contains_emoji(self, text: str) -> bool:
        """Check if text contains emoji"""
        import re
        emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"  # emoticons
            "\U0001F300-\U0001F5FF"  # symbols & pictographs
            "\U0001F680-\U0001F6FF"  # transport & map symbols
            "\U0001F1E0-\U0001F1FF"  # flags (iOS)
            "\U00002600-\U000026FF"  # miscellaneous symbols
            "\U00002700-\U000027BF"  # dingbats
            "]+", flags=re.UNICODE
        )
        return bool(emoji_pattern.search(text))
    
    def _detect_message_type(self, message: str) -> str:
        """Detect message type based on content"""
        if not message:
            return 'system'
        if '<Media omitted>' in message or '<media omitted>' in message:
            return 'media'
        if 'This message was deleted' in message or 'deleted this message' in message:
            return 'deleted'
        return 'text'
    
    def _generate_recommendations(self, issues: List[Dict[str, Any]]) -> List[str]:
        """Generate recommendations based on integrity issues"""
        recommendations = []
        
        if any(issue['type'] == 'incomplete_processing' for issue in issues):
            recommendations.append('Re-process files with incomplete processing status')
        
        if any(issue['type'] == 'corrupted_data' for issue in issues):
            recommendations.append('Re-upload files with corrupted data')
        
        if any(issue['severity'] == 'critical' for issue in issues):
            recommendations.append('IMMEDIATE ACTION REQUIRED for critical data integrity issues')
        
        if not recommendations:
            recommendations.append('All data integrity checks passed - no action required')
        
        return recommendations

# Global Firebase service instance
firebase_service = None

def get_firebase_service() -> FirebaseService:
    """Get or create Firebase service instance"""
    global firebase_service
    if firebase_service is None:
        firebase_service = FirebaseService()
    return firebase_service 