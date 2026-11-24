# ניהול יום

אפליקציית מטרות יומיות, אימונים ורצף. אתר סטטי (GitHub Pages) עם Supabase לחשבונות, שמירה והתראות.

- `app.html`: קוד האפליקציה.
- `tools/build.py`: בונה את `index.html` מ־`app.html` (סופהבייס, התראות, התקנה למסך הבית).
- `sw.js`, `manifest.webmanifest`, `icons/`: אפליקציה למסך הבית והתראות.

אחרי שינוי ב־`app.html`: `python3 tools/build.py`, ואז commit ו־push.
