#!/usr/bin/env python3
"""
Test script for WhatsApp Analyzer
This script tests the core functionality and integration of the analyzer
"""

import os
import sys
import tempfile
from datetime import datetime
from whatsapp_analyzer import WhatsAppAnalyzer

def create_test_data():
    """Create sample WhatsApp export data for testing"""
    test_data = """[15/12/2023, 14:30:25] John Doe: Hello! How are you? 😊
[15/12/2023, 14:31:10] Jane Smith: I'm good, thanks! How about you?
[15/12/2023, 14:32:15] John Doe: Great! Just finished my work for the day
[15/12/2023, 14:33:20] Jane Smith: That's awesome! 🎉
[15/12/2023, 14:34:30] John Doe: Yeah, feeling pretty productive today
[15/12/2023, 15:00:00] Jane Smith: Should we grab coffee later?
[15/12/2023, 15:01:15] John Doe: Sure! That sounds great ☕
[15/12/2023, 15:02:30] Jane Smith: Perfect! Let's meet at 4 PM
[15/12/2023, 15:03:45] John Doe: Works for me! See you there 👍
[16/12/2023, 09:15:20] Jane Smith: Good morning! 🌅
[16/12/2023, 09:16:35] John Doe: Morning! How's your day starting?
[16/12/2023, 09:17:50] Jane Smith: Pretty good! Just had breakfast
[16/12/2023, 09:18:05] John Doe: Nice! What did you have?
[16/12/2023, 09:19:20] Jane Smith: Just some toast and coffee 🍞☕
[16/12/2023, 09:20:35] John Doe: Sounds delicious! I'm still in bed 😴
[16/12/2023, 09:21:50] Jane Smith: Haha, lazy! 😄
[16/12/2023, 09:22:05] John Doe: Hey, it's Saturday! 😅
[16/12/2023, 09:23:20] Jane Smith: True! Enjoy your sleep 😊
[16/12/2023, 09:24:35] John Doe: Thanks! Will do 😴
[16/12/2023, 09:25:50] Jane Smith: Talk to you later! 👋"""
    
    return test_data

def test_basic_functionality():
    """Test basic analyzer functionality"""
    print("🧪 Testing basic functionality...")
    
    # Create test file
    test_data = create_test_data()
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
        f.write(test_data)
        test_file_path = f.name
    
    try:
        # Initialize analyzer
        analyzer = WhatsAppAnalyzer()
        
        # Test parsing
        success = analyzer.parse_whatsapp_export(test_file_path)
        if not success:
            print("❌ Failed to parse test data")
            return False
        
        print("✅ Successfully parsed test data")
        
        # Test basic stats
        basic_stats = analyzer.get_basic_stats()
        if not basic_stats:
            print("❌ Failed to get basic stats")
            return False
        
        print(f"✅ Basic stats: {basic_stats['total_messages']} messages, {basic_stats['total_participants']} participants")
        
        # Test other analyses
        hourly_activity = analyzer.get_message_activity_by_hour()
        daily_activity = analyzer.get_message_activity_by_day()
        emoji_analysis = analyzer.get_emoji_analysis()
        word_analysis = analyzer.get_word_analysis()
        sentiment_analysis = analyzer.get_sentiment_analysis()
        
        print("✅ All analysis methods working")
        
        return True
        
    except Exception as e:
        print(f"❌ Error during testing: {str(e)}")
        return False
    finally:
        # Clean up test file
        if os.path.exists(test_file_path):
            os.unlink(test_file_path)

def test_visualization_functions():
    """Test visualization functions"""
    print("🎨 Testing visualization functions...")
    
    # Create test file
    test_data = create_test_data()
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
        f.write(test_data)
        test_file_path = f.name
    
    try:
        analyzer = WhatsAppAnalyzer()
        success = analyzer.parse_whatsapp_export(test_file_path)
        
        if not success:
            print("❌ Failed to parse test data for visualization")
            return False
        
        # Test visualization functions
        heatmap = analyzer.create_activity_heatmap()
        timeline = analyzer.create_message_timeline()
        participant_chart = analyzer.create_participant_comparison()
        wordcloud = analyzer.generate_wordcloud()
        
        if heatmap and timeline and participant_chart and wordcloud:
            print("✅ All visualization functions working")
            return True
        else:
            print("❌ Some visualization functions failed")
            return False
            
    except Exception as e:
        print(f"❌ Error during visualization testing: {str(e)}")
        return False
    finally:
        if os.path.exists(test_file_path):
            os.unlink(test_file_path)

def test_error_handling():
    """Test error handling"""
    print("🛡️ Testing error handling...")
    
    analyzer = WhatsAppAnalyzer()
    
    # Test with non-existent file
    try:
        success = analyzer.parse_whatsapp_export("non_existent_file.txt")
        if not success:
            print("✅ Correctly handled non-existent file")
        else:
            print("❌ Should have failed for non-existent file")
            return False
    except Exception as e:
        print(f"✅ Correctly raised exception for non-existent file: {str(e)}")
    
    # Test with empty file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
        f.write("")
        empty_file_path = f.name
    
    try:
        success = analyzer.parse_whatsapp_export(empty_file_path)
        if not success:
            print("✅ Correctly handled empty file")
        else:
            print("❌ Should have failed for empty file")
            return False
    except Exception as e:
        print(f"✅ Correctly handled empty file: {str(e)}")
    finally:
        if os.path.exists(empty_file_path):
            os.unlink(empty_file_path)
    
    return True

def test_report_generation():
    """Test report generation"""
    print("📊 Testing report generation...")
    
    test_data = create_test_data()
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f:
        f.write(test_data)
        test_file_path = f.name
    
    try:
        analyzer = WhatsAppAnalyzer()
        success = analyzer.parse_whatsapp_export(test_file_path)
        
        if not success:
            print("❌ Failed to parse test data for report generation")
            return False
        
        # Generate report
        report_path = "test_report.html"
        analyzer.export_analysis_report(report_path)
        
        if os.path.exists(report_path):
            print("✅ Report generated successfully")
            # Clean up
            os.unlink(report_path)
            return True
        else:
            print("❌ Report file not created")
            return False
            
    except Exception as e:
        print(f"❌ Error during report generation: {str(e)}")
        return False
    finally:
        if os.path.exists(test_file_path):
            os.unlink(test_file_path)

def check_dependencies():
    """Check if all required dependencies are available"""
    print("📦 Checking dependencies...")
    
    required_packages = [
        'pandas', 'matplotlib', 'seaborn', 'plotly', 'streamlit',
        'emoji', 'wordcloud', 'nltk', 'textblob'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package)
            print(f"✅ {package}")
        except ImportError:
            print(f"❌ {package} - MISSING")
            missing_packages.append(package)
    
    if missing_packages:
        print(f"\n⚠️ Missing packages: {', '.join(missing_packages)}")
        print("Install them with: pip install -r requirements.txt")
        return False
    else:
        print("✅ All dependencies available")
        return True

def main():
    """Main test function"""
    print("🚀 Starting WhatsApp Analyzer Tests")
    print("=" * 50)
    
    tests = [
        ("Dependencies", check_dependencies),
        ("Basic Functionality", test_basic_functionality),
        ("Visualization Functions", test_visualization_functions),
        ("Error Handling", test_error_handling),
        ("Report Generation", test_report_generation)
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n🔍 Running {test_name} test...")
        try:
            if test_func():
                passed += 1
                print(f"✅ {test_name} test PASSED")
            else:
                print(f"❌ {test_name} test FAILED")
        except Exception as e:
            print(f"❌ {test_name} test FAILED with exception: {str(e)}")
    
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! The analyzer is ready to use.")
        return True
    else:
        print("⚠️ Some tests failed. Please check the issues above.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)