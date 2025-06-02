from fastapi import FastAPI, HTTPException, status, Body, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import secrets
import uuid
from datetime import datetime, timezone
from enum import Enum
import random
import requests
import os

app = FastAPI()

# --- CORS ---
origins = ["http://localhost:3000", "http://localhost:5173","http://192.168.1.16:5173","https://drawing-board-bice.vercel.app"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Constants & Game Config ---
MAX_PLAYERS_PER_ROOM = 6
MIN_PLAYERS_TO_START = 2 # Minimum players for a game
ROOM_CODE_LENGTH = 6
ROUND_DURATION_SECONDS = 100 # All players draw together for 100 seconds
PREDEFINED_TOPICS = [
    "Apple", "Banana", "Car", "Dog", "Elephant", "Flower", "Guitar", "House",
    "Ice Cream", "Jacket", "Kite", "Lion", "Moon", "Ninja", "Octopus", "Pizza",
    "Queen", "Robot", "Sun", "Tree", "Umbrella", "Volcano", "Watch", "Xylophone",
    "Yacht", "Zebra", "Book", "Chair", "Cloud", "Dragon", "Fish", "Ghost"
]

# --- Pydantic Models & Enums ---
class Player(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str

class GamePhase(str, Enum):
    LOBBY = "lobby"
    DRAWING = "drawing"
    ROUND_TRANSITION = "round_transition" # Brief phase between rounds
    GAME_OVER = "game_over"

class SubmittedDrawing(BaseModel):
    drawer_id: str
    drawer_name: str
    topic: str
    image_b64: str # Base64 encoded image data

class RoomBase(BaseModel):
    name: Optional[str] = "Unnamed Room"

class RoomCreate(RoomBase):
    host_name: str

class RoomJoin(BaseModel):
    player_name: str

class PlayerIdBody(BaseModel): # For requests just needing player_id
    player_id: str

class SubmitDrawingRequest(BaseModel):
    player_id: str # ID of the current drawer
    image_b64: str

class Room(RoomBase):
    code: str
    host_id: str
    players: List[Player] = []
    max_players: int = MAX_PLAYERS_PER_ROOM

    # Game State Fields
    game_phase: GamePhase = GamePhase.LOBBY
    current_topic: Optional[str] = None
    round_start_time: Optional[datetime] = None
    round_duration_seconds: int = ROUND_DURATION_SECONDS

    # Simultaneous drawing: no turn order, no current_drawer_id
    submitted_drawings: List[SubmittedDrawing] = []

    # Add judgment result fields
    judgment_result: Optional[dict] = None  # {"summary": str, "winner_id": str, "winner_name": str}


# --- In-memory "database" ---
rooms_db: Dict[str, Room] = {}

def generate_room_code() -> str:
    # ... (same as before)
    while True:
        code = secrets.token_urlsafe(ROOM_CODE_LENGTH // 2 + 1)[:ROOM_CODE_LENGTH].upper().replace("_", "A").replace("-","B")
        if code not in rooms_db:
            return code

def get_player_name_by_id(room: Room, player_id: str) -> Optional[str]:
    for player in room.players:
        if player.id == player_id:
            return player.name
    return None

# --- API Endpoints ---
# /create, /join, /leave, /get_room_details remain largely the same for player management.
# Ensure /leave handles removing player from player_draw_order if game is active.
@app.get("/")
def read_root():
    return {"message": "Hello from FastAPI on PythonAnywhere!"}


@app.post("/rooms/create", response_model=Room, status_code=status.HTTP_201_CREATED)
async def create_new_room(room_data: RoomCreate):
    room_code = generate_room_code()
    host_player = Player(name=room_data.host_name)
    new_room = Room(
        name=room_data.name if room_data.name else f"Room {room_code}",
        code=room_code,
        host_id=host_player.id,
        players=[host_player]
    )
    rooms_db[room_code] = new_room
    return new_room

@app.post("/rooms/{room_code}/join", response_model=Room)
async def join_existing_room(room_code: str, join_data: RoomJoin):
    room_code = room_code.upper()
    if room_code not in rooms_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    room = rooms_db[room_code]

    if room.game_phase != GamePhase.LOBBY and room.game_phase != GamePhase.GAME_OVER : # Can only join before game starts or after it ends
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot join an active game.")
    if len(room.players) >= room.max_players:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Room is full")

    new_player = Player(name=join_data.player_name)
    room.players.append(new_player)
    return room

@app.post("/rooms/{room_code}/leave", response_model=Room)
async def leave_room(room_code: str, body: PlayerIdBody): # Expects {"player_id": "..."}
    room_code_upper = room_code.upper()
    player_id_to_leave = body.player_id

    if room_code_upper not in rooms_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    room = rooms_db[room_code_upper]

    original_player_count = len(room.players)
    player_left_instance = next((p for p in room.players if p.id == player_id_to_leave), None)
    
    if not player_left_instance: # Player not in room
        return room # Or raise 404 for player

    room.players = [p for p in room.players if p.id != player_id_to_leave]

    if not room.players: # Last player left
        del rooms_db[room_code_upper]
        # Client should redirect to lobby or show message
        raise HTTPException(status_code=status.HTTP_200_OK, detail="Room closed as last player left.")

    # If player was in draw order, remove them
    if player_id_to_leave in room.submitted_drawings:
        # Find index of leaving player in draw order
        try:
            leaving_player_draw_index = next(i for i, d in enumerate(room.submitted_drawings) if d.drawer_id == player_id_to_leave)
            room.submitted_drawings.pop(leaving_player_draw_index)
            

        except ValueError:
            pass # Player wasn't in draw order

    # Handle host leaving
    if room.host_id == player_id_to_leave and room.players:
        room.host_id = room.players[0].id # New host is the next player
        print(f"New host for room {room.code} is {room.players[0].name} ({room.host_id})")

    # If game was active and player count drops below minimum, end it
    if room.game_phase not in [GamePhase.LOBBY, GamePhase.GAME_OVER] and len(room.players) < MIN_PLAYERS_TO_START:
        room.game_phase = GamePhase.GAME_OVER # Or LOBBY
        # No new drawings added, just end
        room.current_topic = None
        print(f"Game in room {room.code} ended due to insufficient players.")

    return room


# --- Game Management Helper Functions ---
def _select_new_topic(room: Room) -> str:
    # Add logic to avoid recently used topics if desired
    return random.choice(PREDEFINED_TOPICS)

def _reset_game_state_fields(room: Room, new_phase: GamePhase = GamePhase.LOBBY):
    room.game_phase = new_phase
    room.current_topic = None
    room.round_start_time = None
    room.submitted_drawings = []


# --- Game Flow Endpoints ---

@app.post("/rooms/{room_code}/start-game", response_model=Room)
async def start_game(room_code: str, body: PlayerIdBody):
    room_code_upper = room_code.upper()
    player_id = body.player_id

    if room_code_upper not in rooms_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    room = rooms_db[room_code_upper]

    if room.host_id != player_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can start the game.")
    if room.game_phase != GamePhase.LOBBY:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Game can only be started from the lobby.")
    if len(room.players) < MIN_PLAYERS_TO_START:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Need at least {MIN_PLAYERS_TO_START} players to start.")

    # Simultaneous drawing setup
    _reset_game_state_fields(room, GamePhase.DRAWING)
    room.current_topic = _select_new_topic(room)
    room.round_start_time = datetime.now(timezone.utc)
    print(f"Game started in room {room.code}. Topic: {room.current_topic}")
    return room

@app.post("/rooms/{room_code}/submit-drawing", response_model=Room)
async def submit_drawing_and_advance_turn(room_code: str, request_data: SubmitDrawingRequest):
    room_code_upper = room_code.upper()
    if room_code_upper not in rooms_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    room = rooms_db[room_code_upper]

    if room.game_phase != GamePhase.DRAWING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not in drawing phase.")

    # Prevent duplicate submissions from same player
    if any(d.drawer_id == request_data.player_id for d in room.submitted_drawings):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You have already submitted your drawing.")

    drawer_name = get_player_name_by_id(room, request_data.player_id) or "Unknown Drawer"
    drawing = SubmittedDrawing(
        drawer_id=request_data.player_id,
        drawer_name=drawer_name,
        topic=room.current_topic or "No Topic",
        image_b64=request_data.image_b64
    )
    room.submitted_drawings.append(drawing)
    print(f"Drawing submitted by {drawer_name} in room {room.code}")

    # If all players submitted, end game early
    if len(room.submitted_drawings) >= len(room.players):
        room.game_phase = GamePhase.GAME_OVER

    return room

@app.post("/rooms/{room_code}/play-again", response_model=Room)
async def play_again(room_code: str, body: PlayerIdBody):
    room_code_upper = room_code.upper()
    player_id = body.player_id

    if room_code_upper not in rooms_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    room = rooms_db[room_code_upper]

    if room.host_id != player_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the host can restart the game.")
    if room.game_phase != GamePhase.GAME_OVER:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Game can only be restarted when it's over.")
    if len(room.players) < MIN_PLAYERS_TO_START:
         _reset_game_state_fields(room, GamePhase.LOBBY)
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Need at least {MIN_PLAYERS_TO_START} players. Returning to Lobby.")

    # Start new simultaneous drawing round
    _reset_game_state_fields(room, GamePhase.DRAWING)
    room.current_topic = _select_new_topic(room)
    room.round_start_time = datetime.now(timezone.utc)
    print(f"Game restarted in room {room.code}.")
    return room

# Gemini API helper
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")  # Set this in your environment
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent"

def call_gemini_judge(submissions):
    """
    submissions: List[dict] with keys: drawer_name, topic, image_b64
    Returns: dict with keys: summary (str), winner_name (str), winner_id (str)
    """
    # Prepare prompt
    prompt = (
        "You are a funny and witty art judge for a drawing game. "
        "Below are the final submissions. For each, give a brief, humorous description of the drawing "
        "and then pick a winner in a funny tone. "
        "Format your answer as:\n"
        "Descriptions:\n"
        "- {drawer_name}: {description}\n"
        "... (repeat for each)\n"
        "Winner: {drawer_name}\n"
        "Reason: {funny_reason}\n"
        "Here are the submissions:\n"
    )
    for i, sub in enumerate(submissions):
        prompt += f"{i+1}. {sub['drawer_name']} drew '{sub['topic']}'. (Image is base64 PNG, not shown here)\n"

    # Gemini API call
    headers = {"Content-Type": "application/json"}
    data = {
        "contents": [
            {
                "parts": [
                    {"text": prompt}
                ]
            }
        ]
    }
    params = {"key": GEMINI_API_KEY}
    gemini_text = "" # Initialize to ensure it's always defined

    try:
        resp = requests.post(GEMINI_API_URL, headers=headers, params=params, json=data, timeout=30)
        resp.raise_for_status() # Check for HTTP errors (4xx or 5xx)
        
        parsed_response = resp.json()

        if isinstance(parsed_response, list):
            # If response is a list (e.g., from a stream being fully read into a JSON array)
            all_text_parts_collected = []
            for chunk in parsed_response:
                # Ensure chunk is a dictionary and navigate safely
                if isinstance(chunk, dict) and "candidates" in chunk:
                    for candidate in chunk.get("candidates", []):
                        if isinstance(candidate, dict) and "content" in candidate:
                            content = candidate.get("content", {})
                            if isinstance(content, dict) and "parts" in content:
                                for part_item in content.get("parts", []):
                                    if isinstance(part_item, dict) and "text" in part_item:
                                        all_text_parts_collected.append(part_item["text"])
            gemini_text = "".join(all_text_parts_collected)
        elif isinstance(parsed_response, dict):
            # If response is a dictionary (e.g., non-streaming response or already aggregated stream)
            candidates = parsed_response.get("candidates")
            if candidates and isinstance(candidates, list) and len(candidates) > 0:
                candidate = candidates[0] # Assuming the first candidate is primary
                if isinstance(candidate, dict):
                    content = candidate.get("content")
                    if isinstance(content, dict):
                        parts = content.get("parts")
                        if isinstance(parts, list) and len(parts) > 0:
                            part = parts[0] # Assuming the first part of the content
                            if isinstance(part, dict) and "text" in part:
                                gemini_text = part["text"]
            if not gemini_text: # If any check failed and gemini_text wasn't set
                 print("Gemini API warning: Response dictionary has unexpected structure or missing text.")
        else:
            # Should not happen if resp.json() works as expected (returns list or dict)
            print(f"Gemini API error: Unexpected response type from resp.json(): {type(parsed_response)}")

        if not gemini_text: # Log if no text could be extracted.
             print("Gemini API warning: No text content extracted from response. Proceeding with empty text.")
             # The original parsing logic will produce empty summary/winner if gemini_text is empty

        # --- Original parsing logic from user's code ---
        # This logic will run on the correctly populated `gemini_text`
        summary = ""
        winner_name = ""
        for line in gemini_text.splitlines():
            if line.strip().startswith("Descriptions:"):
                summary = "" # This reset behavior is kept as per original
            elif line.strip().startswith("- "):
                summary += line + "\n"
            elif line.strip().startswith("Winner:"):
                winner_name = line.split(":", 1)[-1].strip()
            elif line.strip().startswith("Reason:"):
                summary += line + "\n" # Appends the "Reason: ..." line itself
        # --- End of original parsing logic ---
        
        print(summary.strip()),
        print(winner_name),
        return {
            "summary": summary.strip(),
            "winner_name": winner_name,
        }
    except requests.exceptions.RequestException as e: # Covers connection errors, timeouts, HTTP errors etc.
        print(f"Gemini API request failed: {e}")
        return {"summary": "Could not connect to Gemini AI.", "winner_name": ""}
    except (KeyError, IndexError, TypeError, ValueError) as e: 
        # Catches errors from malformed JSON structure if assumptions fail, or json() parsing issues.
        response_text_snippet = "N/A"
        if 'resp' in locals() and hasattr(resp, 'text') and resp.text:
            response_text_snippet = resp.text[:200] + "..."
        print(f"Error processing Gemini API response structure: {e}. Response snippet: {response_text_snippet}")
        return {"summary": "Error understanding Gemini AI's response structure.", "winner_name": ""}
    except Exception as e: # General catch-all for any other unexpected errors
        print(f"Gemini API error (general exception): {e}")
        response_text_snippet = "N/A"
        if 'resp' in locals() and hasattr(resp, 'text') and resp.text: # Check if resp and resp.text exist
            response_text_snippet = resp.text[:200] + "..."
        print(f"Gemini Response Snippet (if available): {response_text_snippet}")
        return { # Original fallback
            "summary": "Could not get a judgment from Gemini AI.",
            "winner_name": "",
        }
def run_gemini_judgment(room: Room):
    if not room.submitted_drawings or len(room.submitted_drawings) == 0:
        room.judgment_result = {
            "summary": "No drawings to judge.",
            "winner_id": "",
            "winner_name": "",
        }
        return
    submissions = [
        {
            "drawer_name": d.drawer_name,
            "topic": d.topic,
            "image_b64": d.image_b64,
            "drawer_id": d.drawer_id,
        }
        for d in room.submitted_drawings
    ]
    result = call_gemini_judge(submissions)
    winner_id = ""
    for d in room.submitted_drawings:
        if d.drawer_name == result.get("winner_name"):
            winner_id = d.drawer_id
            break
    room.judgment_result = {
        "summary": result.get("summary", ""),
        "winner_id": winner_id,
        "winner_name": result.get("winner_name", ""),
    }

@app.post("/rooms/{room_code}/judge", response_model=Room)
async def judge_room(room_code: str, background_tasks: BackgroundTasks):
    room_code_upper = room_code.upper()
    if room_code_upper not in rooms_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    room = rooms_db[room_code_upper]
    if room.game_phase != GamePhase.GAME_OVER:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Judgment only after game over.")
    # Run Gemini judgment in background (blocking is fine for demo, but use background for real apps)
    background_tasks.add_task(run_gemini_judgment, room)
    return room

@app.get("/rooms/{room_code}", response_model=Room)
async def get_room_details(room_code: str):
    room_code = room_code.upper()
    if room_code not in rooms_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    room = rooms_db[room_code]
    # If in drawing phase and time is up, move to game over
    if room.game_phase == GamePhase.DRAWING and room.round_start_time:
        now = datetime.now(timezone.utc)
        elapsed = (now - room.round_start_time).total_seconds()
        if elapsed >= room.round_duration_seconds:
            room.game_phase = GamePhase.GAME_OVER
    # If in game over and judgment not done, trigger judgment (sync for now)
    if room.game_phase == GamePhase.GAME_OVER and not room.judgment_result:
        run_gemini_judgment(room)
    return room