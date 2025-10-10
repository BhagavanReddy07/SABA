# SABA - AI Assistant Prototype

An intelligent AI assistant built with Next.js, Genkit, and Google's Gemini API. Features include chat interface, task management, and persistent conversation memory using Redis and PostgreSQL.

## Features

- 🤖 AI-powered chat interface using Google's Gemini API
- 💾 Persistent storage with PostgreSQL and Redis
- 🔄 Real-time conversation memory
- 🎯 Task management capabilities
- 🚀 Modern tech stack with Next.js and TypeScript
- 🛠 Docker support for easy development

## Prerequisites

Before running this project, make sure you have:

- [Node.js](https://nodejs.org/) v20 or later
- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- [Git](https://git-scm.com/)
- A [Google AI Studio](https://aistudio.google.com/app/apikey) API key

## Quick Start Guide

### 1. Clone the Repository

```bash
git clone https://github.com/BhagavanReddy07/AI-assistant-prototype.git
cd AI-assistant-prototype
```

### 2. Set Up Environment Variables

```bash
# Copy the example env file
cp .env.example .env.local

# Edit .env.local with your settings
# Most importantly, add your Gemini API key:
GEMINI_API_KEY=your_api_key_here
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Docker Services

The project uses Docker Compose to manage Redis, PostgreSQL, and Neo4j:

```bash
# Start all services
npm run docker:up

# To stop services when done
npm run docker:down
```

### 5. Start Development Server

```bash
# This will start Next.js with Docker services
npm run dev:with-docker
```

Visit [http://localhost:9003](http://localhost:9003) to see the application.

## Project Structure

```
├── src/
│   ├── ai/              # AI/Genkit integration
│   │   ├── flows/       # AI conversation flows
│   │   └── genkit.ts    # Genkit configuration
│   ├── app/             # Next.js app directory
│   │   └── api/         # API routes
│   ├── components/      # React components
│   │   ├── chat/        # Chat interface components
│   │   └── ui/          # UI components
│   └── lib/            # Utilities and database clients
├── scripts/            # Database initialization scripts
└── docker-compose.yml  # Docker services configuration
```

## Development Tools

### Start Genkit Development UI

```bash
npm run genkit:watch
```

This starts the Genkit Developer UI at [http://localhost:4000](http://localhost:4000)

### Check Docker Services

```bash
# Check Redis data
docker exec -it saba-redis redis-cli -p 6380

# Check PostgreSQL data
docker exec -it saba-postgres psql -U saba
```

## Database Schemas

### PostgreSQL Tables
- Users: Stores user accounts and authentication data
- Conversations: Stores chat history and metadata
- Tasks: Stores user tasks and reminders

### Redis Data
- Session data
- Temporary conversation context
- Real-time chat state

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Troubleshooting

### Common Issues

1. **Docker Services Not Starting**
   ```bash
   # Check service status
   docker ps
   # Check logs
   docker-compose logs
   ```

2. **Database Connection Issues**
   - Verify PostgreSQL is running: `docker ps | grep postgres`
   - Check connection string in .env.local
   - Ensure port 5432 is available

3. **Genkit/AI Issues**
   - Verify API key in .env.local
   - Check Genkit logs: `npm run genkit:watch`
   - Ensure internet connectivity for API calls

## License

This project is licensed under the MIT License - see the LICENSE file for details.

This project requires two separate development servers to be running at the same time: one for the Next.js web application and one for the Genkit AI flows. Make sure your Redis container is running before starting the servers.

**Terminal 1: Run the Next.js App**

In your first terminal, start the web application:

```bash
npm run dev
```

This will typically start the application on `http://localhost:9002`.

**Terminal 2: Run the Genkit Flows**

In a second, separate terminal, start the Genkit development server:

```bash
npm run genkit:watch
```

This command watches your AI flow files for any changes and keeps the AI backend running.

Once both servers are running, you can open your web browser to `http://localhost:9002` to use the application. Enjoy experimenting with SABA!