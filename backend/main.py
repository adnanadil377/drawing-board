```python
from fastapi import FastAPI, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from datetime import datetime, timezone
from enum import Enum

import secrets
import uuid
import random
import requests
import os
import time

from dotenv import load_dotenv


# ============================================================
# Environment
# ============================================================

load_dotenv()


# ============================================================
# FastAPI
# ============================================================

app = FastAPI()


# ============================================================
# CORS
# ============================================================

origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://192.168.1.16:5173",
    "https://drawing-board-bice.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Game Configuration
# ============================================================

MAX_PLAYERS_PER_ROOM = 6
MIN_PLAYERS_TO_START = 2
ROOM_CODE_LENGTH = 6
ROUND_DURATION_SECONDS = 100

PREDEFINED_TOPICS = [
    "Apple",
    "Banana",
    "Car",
    "Dog",
    "Elephant",
    "Flower",
    "Guitar",
    "House",
    "Ice Cream",
    "Jacket",
    "Kite",
    "Lion",
    "Moon",
    "Ninja",
    "Octopus",
    "Pizza",
    "Queen",
    "Robot",
    "Sun",
    "Tree",
    "Umbrella",
    "Volcano",
    "Watch",
    "Xylophone",
    "Yacht",
    "Zebra",
    "Book",
    "Chair",
    "Cloud",
    "Dragon",
    "Fish",
    "Ghost",
]


# ============================================================
# Pydantic Models
# ============================================================

class Player(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str


class GamePhase(str, Enum):
    LOBBY = "lobby"
    DRAWING = "drawing"
    ROUND_TRANSITION = "round_transition"
    GAME_OVER = "game_over"


class SubmittedDrawing(BaseModel):
    drawer_id: str
    drawer_name: str
    topic: str
    image_b64: str


class RoomBase(BaseModel):
    name: Optional[str] = "Unnamed Room"


class RoomCreate(RoomBase):
    host_name: str


class RoomJoin(BaseModel):
    player_name: str


class PlayerIdBody(BaseModel):
    player_id: str


class SubmitDrawingRequest(BaseModel):
    player_id: str
    image_b64: str


class Room(RoomBase):
    code: str
    host_id: str

    players: List[Player] = Field(default_factory=list)

    max_players: int = MAX_PLAYERS_PER_ROOM

    # Game state
    game_phase: GamePhase = GamePhase.LOBBY
    current_topic: Optional[str] = None
    round_start_time: Optional[datetime] = None
    round_duration_seconds: int = ROUND_DURATION_SECONDS

    # Drawings submitted by players
    submitted_drawings: List[SubmittedDrawing] = Field(
        default_factory=list
    )

    # Gemini judgment
    judgment_result: Optional[dict] = None


# ============================================================
# In-memory database
# ============================================================

rooms_db: Dict[str, Room] = {}


# ============================================================
# Utility Functions
# ============================================================

def generate_room_code() -> str:
    """
    Generate a unique 6-character room code.
    """

    while True:

        code = (
            secrets.token_urlsafe(ROOM_CODE_LENGTH // 2 + 1)
            [:ROOM_CODE_LENGTH]
            .upper()
            .replace("_", "A")
            .replace("-", "B")
        )

        if code not in rooms_db:
            return code


def get_player_name_by_id(
    room: Room,
    player_id: str
) -> Optional[str]:

    for player in room.players:

        if player.id == player_id:
            return player.name

    return None


def get_player_by_id(
    room: Room,
    player_id: str
) -> Optional[Player]:

    for player in room.players:

        if player.id == player_id:
            return player

    return None


# ============================================================
# Root Endpoint
# ============================================================

@app.get("/")
def read_root():

    return {
        "message": "Hello from FastAPI on PythonAnywhere!"
    }


# ============================================================
# Room Management
# ============================================================

@app.post(
    "/rooms/create",
    response_model=Room,
    status_code=status.HTTP_201_CREATED
)
async def create_new_room(room_data: RoomCreate):

    room_code = generate_room_code()

    host_player = Player(
        name=room_data.host_name
    )

    new_room = Room(
        name=(
            room_data.name
            if room_data.name
            else f"Room {room_code}"
        ),
        code=room_code,
        host_id=host_player.id,
        players=[host_player],
    )

    rooms_db[room_code] = new_room

    print(
        f"Room created: {room_code} "
        f"by {host_player.name}"
    )

    return new_room


@app.post(
    "/rooms/{room_code}/join",
    response_model=Room
)
async def join_existing_room(
    room_code: str,
    join_data: RoomJoin
):

    room_code = room_code.upper()

    if room_code not in rooms_db:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )

    room = rooms_db[room_code]

    # Players can join only in lobby or after game over
    if room.game_phase not in [
        GamePhase.LOBBY,
        GamePhase.GAME_OVER
    ]:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot join an active game."
        )

    if len(room.players) >= room.max_players:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Room is full"
        )

    new_player = Player(
        name=join_data.player_name
    )

    room.players.append(new_player)

    print(
        f"{new_player.name} joined room {room.code}"
    )

    return room


@app.post(
    "/rooms/{room_code}/leave",
    response_model=Room
)
async def leave_room(
    room_code: str,
    body: PlayerIdBody
):

    room_code = room_code.upper()

    player_id = body.player_id

    if room_code not in rooms_db:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )

    room = rooms_db[room_code]

    player = get_player_by_id(
        room,
        player_id
    )

    if not player:

        return room

    # Remove player
    room.players = [
        p
        for p in room.players
        if p.id != player_id
    ]

    print(
        f"{player.name} left room {room.code}"
    )

    # Last player left
    if not room.players:

        del rooms_db[room_code]

        raise HTTPException(
            status_code=status.HTTP_200_OK,
            detail="Room closed as last player left."
        )

    # Remove submitted drawing
    room.submitted_drawings = [
        drawing
        for drawing in room.submitted_drawings
        if drawing.drawer_id != player_id
    ]

    # Host leaves
    if room.host_id == player_id:

        room.host_id = room.players[0].id

        print(
            f"New host for room {room.code}: "
            f"{room.players[0].name}"
        )

    # End active game if not enough players
    if (
        room.game_phase
        not in [
            GamePhase.LOBBY,
            GamePhase.GAME_OVER
        ]
        and len(room.players) < MIN_PLAYERS_TO_START
    ):

        room.game_phase = GamePhase.GAME_OVER
        room.current_topic = None

        print(
            f"Game in room {room.code} ended "
            f"due to insufficient players."
        )

    return room


# ============================================================
# Game Helpers
# ============================================================

def select_new_topic(room: Room) -> str:

    return random.choice(
        PREDEFINED_TOPICS
    )


def reset_game_state_fields(
    room: Room,
    new_phase: GamePhase = GamePhase.LOBBY
):

    room.game_phase = new_phase
    room.current_topic = None
    room.round_start_time = None
    room.submitted_drawings = []
    room.judgment_result = None


# ============================================================
# Start Game
# ============================================================

@app.post(
    "/rooms/{room_code}/start-game",
    response_model=Room
)
async def start_game(
    room_code: str,
    body: PlayerIdBody
):

    room_code = room_code.upper()

    player_id = body.player_id

    if room_code not in rooms_db:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )

    room = rooms_db[room_code]

    if room.host_id != player_id:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the host can start the game."
        )

    if room.game_phase != GamePhase.LOBBY:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Game can only be started from the lobby."
        )

    if len(room.players) < MIN_PLAYERS_TO_START:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Need at least "
                f"{MIN_PLAYERS_TO_START} players to start."
            )
        )

    # Reset game
    reset_game_state_fields(
        room,
        GamePhase.DRAWING
    )

    # Select topic
    room.current_topic = select_new_topic(room)

    # Start timer
    room.round_start_time = datetime.now(
        timezone.utc
    )

    print(
        f"Game started in room {room.code}. "
        f"Topic: {room.current_topic}"
    )

    return room


# ============================================================
# Submit Drawing
# ============================================================

@app.post(
    "/rooms/{room_code}/submit-drawing",
    response_model=Room
)
async def submit_drawing(
    room_code: str,
    request_data: SubmitDrawingRequest
):

    room_code = room_code.upper()

    if room_code not in rooms_db:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )

    room = rooms_db[room_code]

    if room.game_phase != GamePhase.DRAWING:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Not in drawing phase."
        )

    # Verify player exists
    drawer_name = get_player_name_by_id(
        room,
        request_data.player_id
    )

    if drawer_name is None:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Player is not part of this room."
        )

    # Prevent duplicate submissions
    if any(
        drawing.drawer_id == request_data.player_id
        for drawing in room.submitted_drawings
    ):

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already submitted your drawing."
        )

    # Validate image exists
    if not request_data.image_b64:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Drawing image is empty."
        )

    drawing = SubmittedDrawing(
        drawer_id=request_data.player_id,
        drawer_name=drawer_name,
        topic=room.current_topic or "No Topic",
        image_b64=request_data.image_b64,
    )

    room.submitted_drawings.append(
        drawing
    )

    print(
        f"Drawing submitted by "
        f"{drawer_name} in room {room.code}"
    )

    # If everyone submitted, game ends
    if len(room.submitted_drawings) >= len(room.players):

        room.game_phase = GamePhase.GAME_OVER

        print(
            f"All players submitted in room "
            f"{room.code}. Game over."
        )

    return room


# ============================================================
# Play Again
# ============================================================

@app.post(
    "/rooms/{room_code}/play-again",
    response_model=Room
)
async def play_again(
    room_code: str,
    body: PlayerIdBody
):

    room_code = room_code.upper()

    player_id = body.player_id

    if room_code not in rooms_db:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )

    room = rooms_db[room_code]

    if room.host_id != player_id:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the host can restart the game."
        )

    if room.game_phase != GamePhase.GAME_OVER:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Game can only be restarted "
                "when it's over."
            )
        )

    if len(room.players) < MIN_PLAYERS_TO_START:

        reset_game_state_fields(
            room,
            GamePhase.LOBBY
        )

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Need at least "
                f"{MIN_PLAYERS_TO_START} players. "
                f"Returning to Lobby."
            )
        )

    # Start new round
    reset_game_state_fields(
        room,
        GamePhase.DRAWING
    )

    room.current_topic = select_new_topic(
        room
    )

    room.round_start_time = datetime.now(
        timezone.utc
    )

    print(
        f"Game restarted in room {room.code}. "
        f"Topic: {room.current_topic}"
    )

    return room


# ============================================================
# Gemini Configuration
# ============================================================

GEMINI_API_KEY = os.getenv(
    "GEMINI_API_KEY"
)

GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL",
    "gemini-flash-latest"
)

GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/"
    f"v1beta/models/{GEMINI_MODEL}:generateContent"
)


# ============================================================
# Gemini Judge
# ============================================================

def call_gemini_judge(submissions):

    """
    Send all submitted drawings to Gemini and ask it
    to judge them.

    Each submission contains:

        drawer_id
        drawer_name
        topic
        image_b64

    Returns:

        {
            "summary": str,
            "winner_name": str
        }
    """

    # --------------------------------------------------------
    # Validate API key
    # --------------------------------------------------------

    if not GEMINI_API_KEY:

        print(
            "Gemini API error: "
            "GEMINI_API_KEY is not configured."
        )

        return {
            "summary": (
                "Gemini API key is not configured."
            ),
            "winner_name": ""
        }

    # --------------------------------------------------------
    # Validate submissions
    # --------------------------------------------------------

    if not submissions:

        return {
            "summary": "No drawings were submitted.",
            "winner_name": ""
        }

    # --------------------------------------------------------
    # Build prompt
    # --------------------------------------------------------

    prompt = """
You are the judge of a funny multiplayer drawing game.

Every player was given the SAME drawing topic and created
their own drawing.

Your job is to:

1. Carefully inspect every submitted image.
2. Briefly describe what each player drew.
3. Compare every drawing with the given topic.
4. Choose exactly ONE winner.
5. Give a short and funny reason for the winner.

IMPORTANT RULES:

- Actually inspect the images.
- Do NOT choose based only on the player's name.
- Judge how well each drawing represents the topic.
- There must be exactly ONE winner.
- The winner must be one of the provided player names.
- The winner name must match the provided player name exactly.

Return your answer in EXACTLY this format:

Descriptions:
- PLAYER_NAME: short humorous description
- PLAYER_NAME: short humorous description

Winner: PLAYER_NAME
Reason: short funny reason

The drawings follow below.
"""

    # --------------------------------------------------------
    # Gemini content parts
    # --------------------------------------------------------

    parts = [
        {
            "text": prompt
        }
    ]

    for index, submission in enumerate(
        submissions
    ):

        drawer_name = submission.get(
            "drawer_name",
            "Unknown Player"
        )

        topic = submission.get(
            "topic",
            "Unknown Topic"
        )

        image_b64 = submission.get(
            "image_b64",
            ""
        )

        if not image_b64:

            print(
                f"Warning: No image for "
                f"{drawer_name}"
            )

            continue

        # ----------------------------------------------------
        # Handle data URI
        #
        # Example:
        #
        # data:image/png;base64,AAAA...
        #
        # Gemini expects only the base64 data.
        # ----------------------------------------------------

        mime_type = "image/png"

        if image_b64.startswith(
            "data:image/"
        ):

            try:

                header, image_b64 = (
                    image_b64.split(
                        ",",
                        1
                    )
                )

                if "image/jpeg" in header:

                    mime_type = "image/jpeg"

                elif "image/jpg" in header:

                    mime_type = "image/jpeg"

                elif "image/webp" in header:

                    mime_type = "image/webp"

                elif "image/png" in header:

                    mime_type = "image/png"

            except ValueError:

                print(
                    f"Could not parse image "
                    f"data URI for {drawer_name}"
                )

        # ----------------------------------------------------
        # Player metadata
        # ----------------------------------------------------

        parts.append(
            {
                "text": (
                    f"\nDrawing {index + 1}\n"
                    f"Player: {drawer_name}\n"
                    f"Topic: {topic}\n"
                    f"Image:"
                )
            }
        )

        # ----------------------------------------------------
        # Actual image
        # ----------------------------------------------------

        parts.append(
            {
                "inline_data": {
                    "mime_type": mime_type,
                    "data": image_b64
                }
            }
        )

    # --------------------------------------------------------
    # Request body
    # --------------------------------------------------------

    data = {
        "contents": [
            {
                "role": "user",
                "parts": parts
            }
        ],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 1000
        }
    }

    headers = {
        "Content-Type": "application/json"
    }

    params = {
        "key": GEMINI_API_KEY
    }

    # --------------------------------------------------------
    # Retry configuration
    # --------------------------------------------------------

    MAX_RETRIES = 4

    RETRYABLE_STATUS_CODES = {
        429,
        500,
        502,
        503,
        504
    }

    # --------------------------------------------------------
    # Send request
    # --------------------------------------------------------

    for attempt in range(
        MAX_RETRIES
    ):

        try:

            print(
                f"Sending {len(submissions)} "
                f"drawings to Gemini "
                f"(attempt {attempt + 1}/"
                f"{MAX_RETRIES})..."
            )

            response = requests.post(
                GEMINI_API_URL,
                headers=headers,
                params=params,
                json=data,
                timeout=60
            )

            # ------------------------------------------------
            # Retry temporary errors
            # ------------------------------------------------

            if response.status_code in (
                RETRYABLE_STATUS_CODES
            ):

                print(
                    f"Gemini returned HTTP "
                    f"{response.status_code}"
                )

                if attempt < MAX_RETRIES - 1:

                    delay = (
                        2 ** attempt
                        + random.uniform(
                            0,
                            1
                        )
                    )

                    print(
                        f"Retrying Gemini in "
                        f"{delay:.2f} seconds..."
                    )

                    time.sleep(delay)

                    continue

                print(
                    "Gemini failed after "
                    f"{MAX_RETRIES} attempts."
                )

                print(
                    f"Response: "
                    f"{response.text[:1000]}"
                )

                return {
                    "summary": (
                        "Gemini is temporarily "
                        "unavailable. Please try again."
                    ),
                    "winner_name": ""
                }

            # ------------------------------------------------
            # Other HTTP errors
            # ------------------------------------------------

            if not response.ok:

                print(
                    f"Gemini API error: "
                    f"HTTP {response.status_code}"
                )

                print(
                    f"Response: "
                    f"{response.text[:1000]}"
                )

                return {
                    "summary": (
                        "Gemini API request failed."
                    ),
                    "winner_name": ""
                }

            # ------------------------------------------------
            # Parse JSON
            # ------------------------------------------------

            response_json = response.json()

            candidates = response_json.get(
                "candidates",
                []
            )

            if not candidates:

                print(
                    "Gemini returned no candidates."
                )

                print(
                    f"Response: {response_json}"
                )

                return {
                    "summary": (
                        "Gemini returned "
                        "no judgment."
                    ),
                    "winner_name": ""
                }

            candidate = candidates[0]

            content = candidate.get(
                "content",
                {}
            )

            response_parts = content.get(
                "parts",
                []
            )

            gemini_text = ""

            for part in response_parts:

                if (
                    isinstance(part, dict)
                    and "text" in part
                ):

                    gemini_text += part["text"]

            gemini_text = gemini_text.strip()

            if not gemini_text:

                print(
                    "Gemini returned empty text."
                )

                print(
                    f"Response: {response_json}"
                )

                return {
                    "summary": (
                        "Gemini returned "
                        "an empty judgment."
                    ),
                    "winner_name": ""
                }

            # ------------------------------------------------
            # Print Gemini response
            # ------------------------------------------------

            print(
                "================ GEMINI ================"
            )

            print(gemini_text)

            print(
                "=========================================="
            )

            # ------------------------------------------------
            # Extract winner
            # ------------------------------------------------

            winner_name = ""

            for line in (
                gemini_text.splitlines()
            ):

                line = line.strip()

                if line.lower().startswith(
                    "winner:"
                ):

                    winner_name = (
                        line.split(
                            ":",
                            1
                        )[1]
                        .strip()
                    )

                    break

            # ------------------------------------------------
            # Get valid player names
            # ------------------------------------------------

            valid_player_names = [
                submission.get(
                    "drawer_name",
                    ""
                ).strip()
                for submission in submissions
            ]

            # ------------------------------------------------
            # Exact case-insensitive match
            # ------------------------------------------------

            exact_match = next(
                (
                    name
                    for name in valid_player_names
                    if name.lower()
                    == winner_name.lower()
                ),
                None
            )

            if exact_match:

                winner_name = exact_match

            else:

                # --------------------------------------------
                # Fuzzy-ish containment fallback
                # --------------------------------------------

                matched_name = next(
                    (
                        name
                        for name in valid_player_names
                        if name.lower()
                        in winner_name.lower()
                    ),
                    None
                )

                if matched_name:

                    winner_name = matched_name

                else:

                    print(
                        "WARNING: Gemini returned "
                        f"invalid winner: "
                        f"{winner_name}"
                    )

                    winner_name = ""

            # ------------------------------------------------
            # Extract descriptions + reason
            # ------------------------------------------------

            summary_lines = []

            for line in (
                gemini_text.splitlines()
            ):

                stripped = line.strip()

                if stripped.startswith("- "):

                    summary_lines.append(
                        stripped
                    )

                elif stripped.lower().startswith(
                    "reason:"
                ):

                    summary_lines.append(
                        stripped
                    )

            summary = "\n".join(
                summary_lines
            )

            # Fallback to complete response
            if not summary:

                summary = gemini_text

            return {
                "summary": summary,
                "winner_name": winner_name
            }

        # ----------------------------------------------------
        # Network error
        # ----------------------------------------------------

        except requests.exceptions.RequestException as e:

            print(
                f"Gemini network error "
                f"(attempt {attempt + 1}/"
                f"{MAX_RETRIES}): {e}"
            )

            if attempt < MAX_RETRIES - 1:

                delay = (
                    2 ** attempt
                    + random.uniform(
                        0,
                        1
                    )
                )

                print(
                    f"Retrying in "
                    f"{delay:.2f} seconds..."
                )

                time.sleep(delay)

            else:

                print(
                    "Gemini request failed "
                    "after all retries."
                )

                return {
                    "summary": (
                        "Could not connect "
                        "to Gemini AI."
                    ),
                    "winner_name": ""
                }

        # ----------------------------------------------------
        # JSON / response parsing error
        # ----------------------------------------------------

        except (
            ValueError,
            KeyError,
            TypeError
        ) as e:

            print(
                f"Error processing Gemini "
                f"response: {e}"
            )

            try:

                print(
                    f"Raw response: "
                    f"{response.text[:1000]}"
                )

            except Exception:

                pass

            return {
                "summary": (
                    "Error understanding "
                    "Gemini's response."
                ),
                "winner_name": ""
            }

        # ----------------------------------------------------
        # Unexpected error
        # ----------------------------------------------------

        except Exception as e:

            print(
                f"Unexpected Gemini error: {e}"
            )

            return {
                "summary": (
                    "Could not get a "
                    "judgment from Gemini AI."
                ),
                "winner_name": ""
            }

    # --------------------------------------------------------
    # Should never reach here
    # --------------------------------------------------------

    return {
        "summary": "Gemini judgment failed.",
        "winner_name": ""
    }


# ============================================================
# Run Gemini Judgment
# ============================================================

def run_gemini_judgment(
    room: Room
):

    # --------------------------------------------------------
    # No submissions
    # --------------------------------------------------------

    if (
        not room.submitted_drawings
        or len(room.submitted_drawings) == 0
    ):

        room.judgment_result = {
            "summary": "No drawings to judge.",
            "winner_id": "",
            "winner_name": ""
        }

        return

    # --------------------------------------------------------
    # Prepare submissions
    # --------------------------------------------------------

    submissions = [
        {
            "drawer_id": drawing.drawer_id,
            "drawer_name": drawing.drawer_name,
            "topic": drawing.topic,
            "image_b64": drawing.image_b64,
        }
        for drawing in room.submitted_drawings
    ]

    # --------------------------------------------------------
    # Call Gemini
    # --------------------------------------------------------

    result = call_gemini_judge(
        submissions
    )

    # --------------------------------------------------------
    # Find winner ID
    # --------------------------------------------------------

    winner_id = ""

    winner_name = result.get(
        "winner_name",
        ""
    )

    if winner_name:

        for drawing in room.submitted_drawings:

            if (
                drawing.drawer_name
                == winner_name
            ):

                winner_id = (
                    drawing.drawer_id
                )

                break

    # --------------------------------------------------------
    # Save result
    # --------------------------------------------------------

    room.judgment_result = {
        "summary": result.get(
            "summary",
            ""
        ),
        "winner_id": winner_id,
        "winner_name": winner_name
    }

    print(
        f"Judgment complete for room "
        f"{room.code}. "
        f"Winner: {winner_name}"
    )


# ============================================================
# Judge Room
# ============================================================

@app.post(
    "/rooms/{room_code}/judge",
    response_model=Room
)
async def judge_room(
    room_code: str,
    background_tasks: BackgroundTasks
):

    room_code = room_code.upper()

    if room_code not in rooms_db:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )

    room = rooms_db[room_code]

    if room.game_phase != GamePhase.GAME_OVER:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Judgment only after game over."
            )
        )

    # Don't trigger duplicate judgments
    if room.judgment_result is not None:

        return room

    print(
        f"Starting Gemini judgment "
        f"for room {room.code}"
    )

    background_tasks.add_task(
        run_gemini_judgment,
        room
    )

    return room


# ============================================================
# Get Room Details
# ============================================================

@app.get(
    "/rooms/{room_code}",
    response_model=Room
)
async def get_room_details(
    room_code: str
):

    room_code = room_code.upper()

    if room_code not in rooms_db:

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )

    room = rooms_db[room_code]

    # --------------------------------------------------------
    # Check drawing timer
    # --------------------------------------------------------

    if (
        room.game_phase
        == GamePhase.DRAWING
        and room.round_start_time
    ):

        now = datetime.now(
            timezone.utc
        )

        elapsed = (
            now
            - room.round_start_time
        ).total_seconds()

        if (
            elapsed
            >= room.round_duration_seconds
        ):

            room.game_phase = (
                GamePhase.GAME_OVER
            )

            print(
                f"Time expired for room "
                f"{room.code}"
            )

    # --------------------------------------------------------
    # Automatic judgment
    # --------------------------------------------------------
    #
    # IMPORTANT:
    # This is synchronous here, meaning the GET request
    # waits for Gemini to finish.
    #
    # We keep this behavior to preserve your current frontend.
    #
    # --------------------------------------------------------

    if (
        room.game_phase
        == GamePhase.GAME_OVER
        and room.judgment_result is None
        and len(room.submitted_drawings) > 0
    ):

        print(
            f"Triggering Gemini judgment "
            f"from room GET for {room.code}"
        )

        run_gemini_judgment(
            room
        )

    return room
```
