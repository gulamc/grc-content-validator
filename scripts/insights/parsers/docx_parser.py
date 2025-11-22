"""
DOCX Parser for Insights Articles

Extracts text, structure, and formatting information from Word documents.
"""

from docx import Document
from typing import Dict, List, Any
import re


class DocxParser:
    """Parser for extracting content and metadata from DOCX files."""

    def __init__(self, file_path: str):
        """
        Initialize the parser with a DOCX file.

        Args:
            file_path: Path to the DOCX file
        """
        self.file_path = file_path
        self.document = Document(file_path)

    def parse(self) -> Dict[str, Any]:
        """
        Parse the document and extract all relevant information.

        Returns:
            dict: Structured document data including text, paragraphs, and metadata
        """
        return {
            'text': self.get_full_text(),
            'paragraphs': self.get_paragraphs(),
            'headings': self.get_headings(),
            'metadata': self.get_metadata(),
            'tables': self.get_tables(),
            'hyperlinks': self.get_hyperlinks(),
            'word_count': self.get_word_count(),
            'character_count': self.get_character_count(),
        }

    def get_full_text(self) -> str:
        """Extract all text from the document."""
        return '\n'.join([para.text for para in self.document.paragraphs])

    def get_paragraphs(self) -> List[Dict[str, Any]]:
        """
        Extract paragraphs with formatting information.

        Returns:
            list: List of paragraph dictionaries with text and style info
        """
        paragraphs = []
        for para in self.document.paragraphs:
            paragraphs.append({
                'text': para.text,
                'style': para.style.name if para.style else None,
                'is_heading': para.style.name.startswith('Heading') if para.style else False,
            })
        return paragraphs

    def get_headings(self) -> List[Dict[str, Any]]:
        """Extract all headings from the document."""
        headings = []
        for para in self.document.paragraphs:
            if para.style and para.style.name.startswith('Heading'):
                level = self._extract_heading_level(para.style.name)
                headings.append({
                    'text': para.text,
                    'level': level,
                    'style': para.style.name,
                })
        return headings

    def get_metadata(self) -> Dict[str, Any]:
        """Extract document metadata."""
        core_props = self.document.core_properties
        return {
            'title': core_props.title or '',
            'author': core_props.author or '',
            'subject': core_props.subject or '',
            'keywords': core_props.keywords or '',
            'created': str(core_props.created) if core_props.created else None,
            'modified': str(core_props.modified) if core_props.modified else None,
        }

    def get_tables(self) -> List[Dict[str, Any]]:
        """Extract table information."""
        tables = []
        for table in self.document.tables:
            table_data = {
                'rows': len(table.rows),
                'columns': len(table.columns),
                'cells': []
            }
            for row in table.rows:
                row_cells = [cell.text for cell in row.cells]
                table_data['cells'].append(row_cells)
            tables.append(table_data)
        return tables

    def get_hyperlinks(self) -> List[str]:
        """
        Extract all hyperlinks from the document.

        Returns:
            list: List of URL strings
        """
        hyperlinks = []
        for para in self.document.paragraphs:
            for run in para.runs:
                if run.hyperlink:
                    hyperlinks.append(run.hyperlink.address)

        # Also extract from XML relationships (more reliable)
        rels = self.document.part.rels
        for rel in rels.values():
            if "hyperlink" in rel.reltype:
                hyperlinks.append(rel.target_ref)

        return list(set(hyperlinks))  # Remove duplicates

    def get_word_count(self) -> int:
        """Count total words in the document."""
        text = self.get_full_text()
        words = re.findall(r'\b\w+\b', text)
        return len(words)

    def get_character_count(self) -> int:
        """Count total characters (excluding whitespace)."""
        text = self.get_full_text()
        return len(text.replace(' ', '').replace('\n', ''))

    def _extract_heading_level(self, style_name: str) -> int:
        """
        Extract heading level from style name.

        Args:
            style_name: Style name like 'Heading 1', 'Heading 2', etc.

        Returns:
            int: Heading level (1-9), or 0 if not a heading
        """
        match = re.search(r'Heading\s+(\d+)', style_name)
        return int(match.group(1)) if match else 0
