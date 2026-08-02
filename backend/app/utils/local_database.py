import sqlite3
import os
import logging
from datetime import date

logger = logging.getLogger("SafeHerDaemon")

class LocalUserDB:
    def __init__(self, db_path="helper/user_state.db"):
        """Initializes the database and ensures the helper directory exists."""
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()
        logger.info(f"[DATABASE] Local SQLite User Profile initialized at {self.db_path}")

    def _init_db(self):
        """Creates the user profile table with gamification columns."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_profile (
                    user_id TEXT PRIMARY KEY,
                    daily_points INTEGER DEFAULT 0,
                    total_points INTEGER DEFAULT 0,
                    recent_flags INTEGER DEFAULT 0,
                    current_rank TEXT DEFAULT 'Rookie Scout',
                    unlocked_badges TEXT DEFAULT '[]',
                    last_active DATE
                )
            ''')
            conn.commit()

    def get_user_state(self, user_id: str = "local_user") -> dict:
        """Fetches the current user state, resetting daily stats if it is a new day."""
        today = date.today().isoformat()
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT daily_points, total_points, recent_flags, current_rank, unlocked_badges, last_active FROM user_profile WHERE user_id = ?", (user_id,))
            row = cursor.fetchone()

            if row is None:
                # First time user
                cursor.execute("INSERT INTO user_profile (user_id, daily_points, total_points, recent_flags, current_rank, unlocked_badges, last_active) VALUES (?, 0, 0, 0, 'Rookie Scout', '[]', ?)", (user_id, today))
                return {"daily_points": 0, "total_points": 0, "recent_flags": 0, "current_rank": "Rookie Scout", "unlocked_badges": "[]"}
            
            daily_points, total_points, recent_flags, current_rank, unlocked_badges, last_active = row
            
            # Reset logic for a new day (keeps total_points and badges intact!)
            if last_active != today:
                cursor.execute("UPDATE user_profile SET daily_points = 0, recent_flags = 0, last_active = ? WHERE user_id = ?", (today, user_id))
                return {
                    "daily_points": 0, 
                    "total_points": total_points, 
                    "recent_flags": 0, 
                    "current_rank": current_rank, 
                    "unlocked_badges": unlocked_badges
                }
                
            return {
                "daily_points": daily_points, 
                "total_points": total_points,
                "recent_flags": recent_flags,
                "current_rank": current_rank,
                "unlocked_badges": unlocked_badges
            }

    def update_user_state(self, user_id: str, new_points: int, new_rank: str = "Rookie Scout", unlocked_badges: str = "[]"):
        """Adds newly calibrated points, increments the flag counter, and saves badges/ranks."""
        today = date.today().isoformat()
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE user_profile 
                SET daily_points = daily_points + ?, 
                    total_points = total_points + ?,
                    recent_flags = recent_flags + 1,
                    current_rank = ?,
                    unlocked_badges = ?,
                    last_active = ?
                WHERE user_id = ?
            ''', (new_points, new_points, new_rank, unlocked_badges, today, user_id))
            conn.commit()