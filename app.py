"""
Insights Article Validator - Flask Application
Pure Python replacement for Next.js frontend
Matches the exact UI from app/insights-validator/page.tsx
"""

from flask import Flask, render_template, request, jsonify
import os
import sys
import json

# Add scripts directory to path so we can import validators
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'scripts', 'insights'))

from run_validation import validate_article

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = '/tmp'

@app.route('/')
def index():
    """Render upload page"""
    return render_template('index.html')

@app.route('/validate', methods=['POST'])
def validate():
    """Handle file upload and validation"""
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            return render_template('results.html', result={
                'success': False,
                'error': 'No file uploaded. Please select a .docx file.'
            })
        
        file = request.files['file']
        
        # Check if filename is empty
        if file.filename == '':
            return render_template('results.html', result={
                'success': False,
                'error': 'No file selected. Please choose a .docx file.'
            })
        
        # Check file extension
        if not file.filename.endswith('.docx'):
            return render_template('results.html', result={
                'success': False,
                'error': 'Invalid file type. Only .docx files are supported.'
            })
        
        # Save file temporarily
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(temp_path)
        
        try:
            # Run validation using existing Python validators
            result = validate_article(temp_path)
            
            # Clean up temp file
            os.remove(temp_path)
            
            # Render results page with validation data
            return render_template('results.html', result=result)
            
        except Exception as e:
            # Clean up temp file on error
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise e
            
    except Exception as e:
        print(f"Error during validation: {str(e)}")
        return render_template('results.html', result={
            'success': False,
            'error': f'Validation failed: {str(e)}'
        })

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    # Azure expects port 8000 for Python apps
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)