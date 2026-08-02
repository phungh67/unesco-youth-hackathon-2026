import pandas as pd
import re
import os
import logging

logger = logging.getLogger("SafeHerDaemon")

# constants
SCORE_MAP = {'low': 1, 'medium': 2, 'high': 3}

TYPE_PRIORITY = {
    'threat': 0,
    'sexual_harassment': 1,
    'identity_attack': 2,
    'insult': 3,
    'body_shaming': 4,
    'general_toxicity': 5,
}

def load_toxic_words(csv_path: str) -> list[dict]:
    df = pd.read_csv(csv_path, encoding='utf-8-sig')
    return (
        df.rename(columns={'Tu': 'word', 'Muc_do': 'level', 'Phan_loai': 'type'})[
            ['word', 'level', 'type']
        ]
        .to_dict('records')
    )

def detect_toxic_words(text: str, toxic_words: list[dict]) -> list[dict]:
    """
    Scan text and return matched entries using strict word boundaries.
    Longer phrases take priority to avoid double-counting substrings.
    """
    text_lower = text.lower()
    
    sorted_words = sorted(toxic_words, key=lambda x: len(x['word']), reverse=True)
    
    matched_entries = []
    
    for entry in sorted_words:
        clean_word = re.escape(entry['word'].lower())
        
        pattern = rf'\b{clean_word}\b'
        
        if re.search(pattern, text_lower):
            matched_entries.append(entry)
            text_lower = re.sub(pattern, " " * len(entry['word']), text_lower)
            
    return matched_entries

def get_action(words: list[str], toxic_words: list[dict]) -> dict:
    """
    Input : list of toxic words already detected, e.g. ['béo', 'vl']
    Output: {score, level, type, matched}

    score : sum of individual word scores (low=1, medium=2, high=3)
    level : based on the highest-scoring word found
    type  : highest-priority type across all matched words
    """
    if not words:
        return {'score': 0, 'level': 'none', 'type': 'none', 'action': 'none'}

    words_lower = [w.lower() for w in words]
    matched_entries: list[dict] = []

    for entry in toxic_words:
        if entry['word'].lower() in words_lower:
            matched_entries.append(entry)

    if not matched_entries:
        return {'score': 0, 'level': 'none', 'type': 'none', 'action': 'none'}

    total_score = sum(SCORE_MAP.get(e['level'], 0) for e in matched_entries)
    best_type = min(matched_entries, key=lambda e: TYPE_PRIORITY.get(e['type'], 99))['type']
    max_level_score = max(SCORE_MAP.get(e['level'], 0) for e in matched_entries)
    level = {1: 'low', 2: 'medium', 3: 'high'}[max_level_score]

    if total_score >= 3:
        action = "report"
    elif total_score == 2:
        action = "reply - Tôi không thích điều này, bạn hãy sửa lại cách nói chuyện nhé."
    else:
        action = "ignore"

    return {
        'score': total_score,
        'level': level,
        'type': best_type,
        'action': action,
    }

def analyze_text(text: str, toxic_words: list[dict]) -> dict:
    matched = detect_toxic_words(text, toxic_words)
    return get_action([e['word'] for e in matched], toxic_words)