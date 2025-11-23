"""
Validators package for article quality assessment

Categories:
- Category 1: Content Quality (30 points)
- Category 2: Legal/Brand (25 points)
- Category 3: Grammar/Style (20 points)
- Category 4: Formatting (15 points)
- Category 5: Technical (10 points)
"""

from .formatting import run_all_formatting_validators

__all__ = ['run_all_formatting_validators']
