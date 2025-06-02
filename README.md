# Drawing Board 🎨

A fun, real-time multiplayer drawing and guessing game built with **React** (frontend) and **FastAPI** (backend). Players join a room, draw based on a random topic, and a judge (AI or human) picks the winner for each round. Great for parties, classrooms, or remote team-building!

## Features

- **Real-time multiplayer:** Join or create rooms and play with friends.
- **Drawing canvas:** Draw your interpretation of the given topic.
- **AI Judge:** The game can use AI to judge and summarize the drawings.
- **Responsive UI:** Works on desktop and mobile devices.
- **Share results:** Share the game results with others.
- **Live website:** [Play Drawing Board here!](https://drawing-board-bice.vercel.app)

## Tech Stack

- **Frontend:** React, Tailwind CSS, Vite
- **Backend:** FastAPI (Python)
- **Deployment:** Vercel (frontend), local or cloud for backend

## Getting Started (Local Development)

### Prerequisites

- Node.js & npm
- Python 3.8+
- (Optional) [Vercel account](https://vercel.com/) for deployment

### 1. Clone the repository

```sh
git clone https://github.com/your-username/drawing-board.git
cd drawing-board
```

### 2. Install and run the backend

```sh
cd backend
pip install fastapi uvicorn requests python-dotenv
#or
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 3. Install and run the frontend

```sh
cd ../frontend
npm install
npm run dev
```

### 4. Access the app

- On your computer: [http://localhost:5173](http://localhost:5173)
- On your phone: `http://<your-computer-ip>:5173` (make sure backend is accessible at `http://<your-computer-ip>:8000`)

## Live Website

👉 [https://drawing-board-bice.vercel.app](https://drawing-board-bice.vercel.app)

## License

MIT

---

*Made with ❤️ for creative fun!*
