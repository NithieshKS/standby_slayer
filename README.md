
# Standby Slayer

A small Flask + SQLite web app for a sustainability behaviour-change prototype.

## What it does
- Creates a nightly shutdown checklist for household devices.
- Lets the user mark devices as switched off.
- Uses progress, streaks and immediate feedback to encourage repetition.
- Lets users add/remove their own devices.
- Stores completed missions and history in SQLite.
- Calculates an illustrative estimate of overnight standby energy avoided.

## Run it on Windows / VS Code

1. Install Python 3 if you do not already have it:
   https://www.python.org/downloads/

2. Open this project folder in VS Code.

3. Open **Terminal > New Terminal**.

4. Create a virtual environment:
   ```powershell
   python -m venv .venv
   ```

5. Activate it:
   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```

   If PowerShell blocks activation, you can instead use Command Prompt:
   ```cmd
   .venv\Scripts\activate.bat
   ```

6. Install Flask:
   ```powershell
   pip install -r requirements.txt
   ```

7. Run the app:
   ```powershell
   python app.py
   ```

8. In your browser, open:
   http://127.0.0.1:5000

The database file `standby_slayer.db` will be created automatically.

## Files
- `app.py` — Flask backend + SQLite database/API
- `templates/index.html` — website structure
- `static/style.css` — styling
- `static/app.js` — front-end interactions
- `requirements.txt` — dependency list

## Assignment note
The energy-savings number is intentionally labelled as an illustrative estimate:
`sum of indicative standby watts × 8 overnight hours / 1000`.

For a stronger final submission, replace the default standby-watt assumptions with values you can justify for your chosen household devices, or present the metric as a prototype estimate rather than a measured environmental outcome.
